import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AmazonBedrockChatLanguageModel } from './amazon-bedrock-chat-language-model';

const baseUrl = 'https://bedrock-runtime.us-east-1.amazonaws.com';
const modelId = 'us.anthropic.claude-sonnet-4-5-20250929-v1:0';
const liveErrorFixture = JSON.parse(
  fs.readFileSync('src/__fixtures__/issue-17197-max-items-error.json', 'utf8'),
);

describe('issue #17197', () => {
  it('does not send maxItems to Bedrock native structured output', async () => {
    const model = new AmazonBedrockChatLanguageModel(modelId, {
      baseUrl: () => baseUrl,
      headers: {},
      generateId: () => 'test-id',
      fetch: async (_input, init) => {
        const requestBody = JSON.parse(String(init?.body));
        const schema =
          requestBody.additionalModelRequestFields?.output_config?.format
            ?.schema;

        if (JSON.stringify(schema).includes('"maxItems"')) {
          return new Response(JSON.stringify(liveErrorFixture), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        return new Response(
          JSON.stringify({
            output: {
              message: {
                role: 'assistant',
                content: [
                  {
                    text: JSON.stringify({
                      labels: [
                        { label: 'Spring', explanation: 'A mild season.' },
                        { label: 'Summer', explanation: 'A warm season.' },
                        { label: 'Autumn', explanation: 'A cool season.' },
                      ],
                    }),
                  },
                ],
              },
            },
            stopReason: 'end_turn',
            usage: {
              inputTokens: 10,
              outputTokens: 20,
              totalTokens: 30,
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      },
    });

    await expect(
      model.doGenerate({
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Generate three labels.' }],
          },
        ],
        responseFormat: {
          type: 'json',
          schema: {
            type: 'object',
            properties: {
              labels: {
                type: 'array',
                maxItems: 3,
                items: {
                  type: 'object',
                  properties: {
                    label: { type: 'string' },
                    explanation: { type: 'string' },
                  },
                  required: ['label', 'explanation'],
                  additionalProperties: false,
                },
              },
            },
            required: ['labels'],
            additionalProperties: false,
          },
        },
      }),
    ).resolves.toMatchObject({
      content: [{ type: 'text' }],
    });
  });
});
