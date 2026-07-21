import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BedrockChatLanguageModel } from './bedrock-chat-language-model';

const errorFixture = JSON.parse(
  fs.readFileSync('src/__fixtures__/issue-17197-max-items-error.json', 'utf8'),
);

describe('issue #17197', () => {
  it('generates structured output when the local schema contains maxItems', async () => {
    const model = new BedrockChatLanguageModel(
      'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
      {
        baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
        headers: {},
        generateId: () => 'test-id',
        fetch: async (_input, init) => {
          const requestBody = JSON.parse(String(init?.body));
          const labelsSchema =
            requestBody.additionalModelRequestFields.output_config.format.schema
              .properties.labels;

          if (labelsSchema.maxItems != null) {
            return new Response(JSON.stringify(errorFixture), {
              status: 400,
              headers: { 'content-type': 'application/json' },
            });
          }

          return Response.json({
            metrics: { latencyMs: 1 },
            output: {
              message: {
                content: [
                  {
                    text: JSON.stringify({
                      labels: [
                        {
                          label: 'billing',
                          explanation: 'The request concerns an invoice.',
                        },
                      ],
                    }),
                  },
                ],
                role: 'assistant',
              },
            },
            stopReason: 'end_turn',
            usage: {
              inputTokens: 10,
              outputTokens: 10,
              totalTokens: 20,
            },
          });
        },
      },
    );

    await expect(
      model.doGenerate({
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Generate a support label.' }],
          },
        ],
        responseFormat: {
          type: 'json',
          schema: {
            type: 'object',
            properties: {
              labels: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    label: { type: 'string' },
                    explanation: { type: 'string' },
                  },
                  required: ['label', 'explanation'],
                  additionalProperties: false,
                },
                maxItems: 3,
              },
            },
            required: ['labels'],
            additionalProperties: false,
          },
        },
      }),
    ).resolves.toMatchObject({
      content: [
        {
          type: 'text',
          text: expect.stringContaining('"labels"'),
        },
      ],
    });
  });
});
