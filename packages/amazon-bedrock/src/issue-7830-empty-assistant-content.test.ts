import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AmazonBedrockChatLanguageModel } from './amazon-bedrock-chat-language-model';

const liveValidationError = fs.readFileSync(
  'src/__fixtures__/issue-7830-empty-assistant-content-error.json',
  'utf8',
);

const prompt: LanguageModelV4Prompt = [
  {
    role: 'user',
    content: [
      {
        type: 'text',
        text: 'How many housing units were recorded in Atlanta?',
      },
    ],
  },
  {
    role: 'assistant',
    content: [
      {
        type: 'reasoning',
        text: 'Only reasoning was generated.',
      },
    ],
  },
  {
    role: 'user',
    content: [{ type: 'text', text: 'How about Virginia Beach?' }],
  },
];

describe('issue #7830', () => {
  it('does not send an empty assistant message after unsigned reasoning is omitted', async () => {
    const model = new AmazonBedrockChatLanguageModel(
      'us.amazon.nova-pro-v1:0',
      {
        baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
        generateId: () => 'test-id',
        fetch: async (_input, init) => {
          const requestBody = String(init?.body);

          if (requestBody.includes('"role":"assistant","content":[]')) {
            return new Response(liveValidationError, {
              status: 400,
              headers: {
                'content-type': 'application/json',
                'x-amzn-errortype': 'ValidationException',
              },
            });
          }

          return new Response(
            JSON.stringify({
              output: {
                message: {
                  role: 'assistant',
                  content: [{ text: 'Virginia Beach response' }],
                },
              },
              stopReason: 'end_turn',
              usage: {
                inputTokens: 1,
                outputTokens: 1,
                totalTokens: 2,
              },
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          );
        },
      },
    );

    await expect(model.doGenerate({ prompt })).resolves.toMatchObject({
      content: [{ type: 'text', text: 'Virginia Beach response' }],
    });
  });
});
