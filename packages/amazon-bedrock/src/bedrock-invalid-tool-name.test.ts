import type { LanguageModelV3Prompt } from '@ai-sdk/provider';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BedrockChatLanguageModel } from './bedrock-chat-language-model';

const invalidToolNameResponse = fs.readFileSync(
  'src/__fixtures__/bedrock-invalid-tool-name-validation-error.json',
  'utf8',
);
const successResponse = fs.readFileSync(
  'src/__fixtures__/bedrock-text.json',
  'utf8',
);

describe('invalid tool names in message history', () => {
  it.each(['$READFILE', 'exchange_delivered_order_items<|channel|>'])(
    'does not crash when replaying %s',
    async toolName => {
      let requestBody: any;

      const model = new BedrockChatLanguageModel('test-model', {
        baseUrl: () => 'https://bedrock-runtime.us-west-2.amazonaws.com',
        headers: {},
        generateId: () => 'test-id',
        fetch: async (_input, init) => {
          requestBody = JSON.parse(init?.body as string);
          const requestToolName = requestBody.messages[1].content[0].toolUse
            .name as string;

          if (!/^[a-zA-Z0-9_-]+$/.test(requestToolName)) {
            return new Response(invalidToolNameResponse, {
              status: 400,
              headers: { 'content-type': 'application/json' },
            });
          }

          return new Response(successResponse, {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        },
      });

      const prompt: LanguageModelV3Prompt = [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Read /tmp/data.txt' }],
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call_123',
              toolName,
              input: {},
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call_123',
              toolName,
              output: { type: 'text', value: 'Tool not found' },
            },
          ],
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'Try something else.' }],
        },
      ];

      await expect(
        model.doGenerate({
          prompt,
          tools: [
            {
              type: 'function',
              name: 'answer',
              description: 'Provide an answer.',
              inputSchema: {
                type: 'object',
                properties: { text: { type: 'string' } },
                required: ['text'],
                additionalProperties: false,
              },
            },
          ],
        }),
      ).resolves.toBeDefined();
      expect(requestBody.messages[1].content[0].toolUse.name).toMatch(
        /^[a-zA-Z0-9_-]+$/,
      );
    },
  );
});
