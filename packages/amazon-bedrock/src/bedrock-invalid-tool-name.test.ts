import type { LanguageModelV2Prompt } from '@ai-sdk/provider';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BedrockChatLanguageModel } from './bedrock-chat-language-model';

const validationError = JSON.parse(
  fs.readFileSync(
    'src/__fixtures__/bedrock-invalid-tool-name-validation-error.json',
    'utf8',
  ),
);

const validResponse = {
  output: {
    message: {
      role: 'assistant',
      content: [{ text: 'Request accepted.' }],
    },
  },
  usage: {
    inputTokens: 1,
    outputTokens: 1,
    totalTokens: 2,
  },
  stopReason: 'end_turn',
};

function createModel() {
  return new BedrockChatLanguageModel(
    'global.anthropic.claude-sonnet-4-5-20250929-v1:0',
    {
      baseUrl: () => 'https://bedrock-runtime.us-west-2.amazonaws.com',
      headers: {},
      generateId: () => 'test-id',
      fetch: async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        const toolNames: string[] = body.messages.flatMap(
          (message: { content: Array<{ toolUse?: { name: string } }> }) =>
            message.content.flatMap(part =>
              part.toolUse == null ? [] : [part.toolUse.name],
            ),
        );

        if (toolNames.some(name => !/^[a-zA-Z0-9_-]+$/.test(name))) {
          return new Response(JSON.stringify(validationError), {
            status: 400,
            headers: {
              'content-type': 'application/json',
              'x-amzn-errortype': 'ValidationException',
            },
          });
        }

        return new Response(JSON.stringify(validResponse), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    },
  );
}

function promptWithReplayedToolName(toolName: string): LanguageModelV2Prompt {
  return [
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
}

describe('replayed invalid tool names', () => {
  for (const toolName of [
    '$READFILE',
    'exchange_delivered_order_items<|channel|>',
  ]) {
    it(`does not cause a provider-level validation crash for ${toolName}`, async () => {
      await expect(
        createModel().doGenerate({
          prompt: promptWithReplayedToolName(toolName),
          tools: [
            {
              type: 'function',
              name: 'answer',
              description: 'Provide an answer',
              inputSchema: {
                type: 'object',
                properties: { text: { type: 'string' } },
                required: ['text'],
                additionalProperties: false,
              },
            },
          ],
        }),
      ).resolves.toMatchObject({
        content: [{ type: 'text', text: 'Request accepted.' }],
      });
    });
  }
});
