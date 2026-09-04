import type { JSONSchema7, LanguageModelV4Prompt } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { expect, it, vi } from 'vitest';
import { createGoogleVertex } from './google-vertex-provider-base';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const TEST_URL =
  'https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.5-flash:generateContent';

const server = createTestServer({
  [TEST_URL]: {},
});

const TEST_PROMPT: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

it('should inline local JSON Schema references in tool requests', async () => {
  server.urls[TEST_URL].response = {
    type: 'json-value',
    body: {
      candidates: [
        {
          content: { parts: [{ text: 'Done' }], role: 'model' },
          finishReason: 'STOP',
          index: 0,
        },
      ],
      usageMetadata: {
        promptTokenCount: 1,
        candidatesTokenCount: 1,
        totalTokenCount: 2,
      },
    },
  };

  const provider = createGoogleVertex({ apiKey: 'test-api-key' });

  await provider('gemini-2.5-flash').doGenerate({
    tools: [
      {
        type: 'function',
        name: 'format-date',
        description: 'Format a date',
        inputSchema: {
          type: 'object',
          properties: {
            locale: {
              $ref: '#/$defs/Locale',
              description: 'Locale for formatting',
            },
          },
          required: ['locale'],
          additionalProperties: false,
          $defs: {
            Locale: { type: 'string', enum: ['de', 'en'] },
          },
        } as JSONSchema7,
      },
    ],
    prompt: TEST_PROMPT,
  });

  expect(
    (await server.calls[0].requestBodyJson).tools[0].functionDeclarations[0]
      .parameters,
  ).toEqual({
    type: 'object',
    properties: {
      locale: {
        type: 'string',
        enum: ['de', 'en'],
        description: 'Locale for formatting',
      },
    },
    required: ['locale'],
  });
});
