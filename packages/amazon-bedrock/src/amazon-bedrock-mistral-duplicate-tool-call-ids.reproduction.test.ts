import fs from 'node:fs';
import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { AmazonBedrockChatLanguageModel } from './amazon-bedrock-chat-language-model';

const firstToolCallId = 'tooluse_Ac1Xq9ZklmNoPq';
const secondToolCallId = 'tooluse_Ac2Yt7WrstUvWx';

const prompt: LanguageModelV4Prompt = [
  {
    role: 'user',
    content: [{ type: 'text', text: 'Look up both values.' }],
  },
  {
    role: 'assistant',
    content: [
      {
        type: 'tool-call',
        toolCallId: firstToolCallId,
        toolName: 'lookup',
        input: { value: 'first' },
      },
      {
        type: 'tool-call',
        toolCallId: secondToolCallId,
        toolName: 'lookup',
        input: { value: 'second' },
      },
    ],
  },
  {
    role: 'tool',
    content: [
      {
        type: 'tool-result',
        toolCallId: firstToolCallId,
        toolName: 'lookup',
        output: { type: 'text', value: 'first result' },
      },
      {
        type: 'tool-result',
        toolCallId: secondToolCallId,
        toolName: 'lookup',
        output: { type: 'text', value: 'second result' },
      },
    ],
  },
];

const recordedBedrockError = JSON.parse(
  fs.readFileSync(
    'src/__fixtures__/amazon-bedrock-mistral-duplicate-tool-call-ids-error.json',
    'utf8',
  ),
);

describe('issue #16182 reproduction', () => {
  it('keeps distinct tool calls distinct when replaying Mistral history', async () => {
    const model = new AmazonBedrockChatLanguageModel(
      'mistral.ministral-3-8b-instruct',
      {
        baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
        headers: {},
        generateId: () => 'test-id',
        fetch: async (_input, init) => {
          const requestBody = JSON.parse(String(init?.body));
          const toolUseIds = requestBody.messages[1].content.map(
            (part: { toolUse: { toolUseId: string } }) =>
              part.toolUse.toolUseId,
          );
          const hasDuplicateToolUseIds =
            new Set(toolUseIds).size !== toolUseIds.length;

          if (hasDuplicateToolUseIds) {
            return new Response(JSON.stringify(recordedBedrockError), {
              status: 400,
              headers: { 'content-type': 'application/json' },
            });
          }

          return Response.json({
            output: {
              message: {
                role: 'assistant',
                content: [{ text: 'Both values were processed.' }],
              },
            },
            stopReason: 'end_turn',
            usage: {
              inputTokens: 1,
              outputTokens: 1,
              totalTokens: 2,
            },
          });
        },
      },
    );

    const result = await model.doGenerate({
      prompt,
      tools: [
        {
          type: 'function',
          name: 'lookup',
          inputSchema: {
            type: 'object',
            properties: { value: { type: 'string' } },
            required: ['value'],
            additionalProperties: false,
          },
        },
      ],
    });

    expect(result.content).toEqual([
      { type: 'text', text: 'Both values were processed.' },
    ]);
  });
});
