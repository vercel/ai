import fs from 'node:fs';
import { expect, it } from 'vitest';
import { BedrockChatLanguageModel } from './bedrock-chat-language-model';

const liveErrorFixture = JSON.parse(
  fs.readFileSync(
    'src/__fixtures__/amazon-bedrock-issue-11227-opus-4-5-error.json',
    'utf8',
  ),
);

it('returns structured output when thinking is enabled for Claude Opus 4.5', async () => {
  const model = new BedrockChatLanguageModel(
    'us.anthropic.claude-opus-4-5-20251101-v1:0',
    {
      baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
      headers: {},
      generateId: () => 'test-id',
      fetch: async () =>
        new Response(JSON.stringify(liveErrorFixture), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }),
    },
  );

  await expect(
    model.doGenerate({
      prompt: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Return an object whose answer is exactly "ok".',
            },
          ],
        },
      ],
      responseFormat: {
        type: 'json',
        schema: {
          type: 'object',
          properties: {
            answer: { type: 'string' },
          },
          required: ['answer'],
          additionalProperties: false,
        },
      },
      maxOutputTokens: 128,
      providerOptions: {
        bedrock: {
          reasoningConfig: {
            type: 'enabled',
            budgetTokens: 1024,
          },
        },
      },
    }),
  ).resolves.toMatchObject({
    content: [
      {
        type: 'text',
        text: '{"answer":"ok"}',
      },
    ],
  });
});
