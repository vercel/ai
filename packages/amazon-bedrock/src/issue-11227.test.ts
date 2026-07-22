import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { expect, it } from 'vitest';
import { AmazonBedrockChatLanguageModel } from './amazon-bedrock-chat-language-model';
import { injectFetchHeaders } from './inject-fetch-headers';

const baseUrl = 'https://bedrock-runtime.us-east-1.amazonaws.com';
const modelId = 'us.anthropic.claude-opus-4-6-v1';
const generateUrl = `${baseUrl}/model/${encodeURIComponent(modelId)}/converse`;

const server = createTestServer({
  [generateUrl]: {
    response: {
      type: 'json-value',
      body: JSON.parse(
        fs.readFileSync(
          'src/__fixtures__/amazon-bedrock-issue-11227-opus-4-6.json',
          'utf8',
        ),
      ),
    },
  },
});

const model = new AmazonBedrockChatLanguageModel(modelId, {
  baseUrl: () => baseUrl,
  headers: {},
  fetch: injectFetchHeaders({ 'x-amz-auth': 'test-auth' }),
  generateId: () => 'test-id',
});

it('supports structured output with thinking for Claude Opus 4.6', async () => {
  const result = await model.doGenerate({
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
  });

  const requestBody = await server.calls[0].requestBodyJson;

  expect(requestBody.toolConfig).toBeUndefined();
  expect(requestBody.additionalModelRequestFields).toMatchObject({
    thinking: {
      type: 'enabled',
      budget_tokens: 1024,
    },
    output_config: {
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            answer: { type: 'string' },
          },
          required: ['answer'],
          additionalProperties: false,
        },
      },
    },
  });
  expect(result.content).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: 'text',
        text: '{"answer":"ok"}',
      }),
    ]),
  );
});
