import type { JSONSchema7, LanguageModelV4Prompt } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { expect, it, vi } from 'vitest';
import { createGoogleVertex } from './google-vertex-provider-base';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const TEST_URL =
  'https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.5-flash:generateContent';
const GEMINI_3_TEST_URL =
  'https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-3.8-flash:generateContent';

const server = createTestServer({
  [TEST_URL]: {},
  [GEMINI_3_TEST_URL]: {},
});

const TEST_PROMPT: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

it('should preserve local JSON Schema references in tool requests', async () => {
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
      .parametersJsonSchema,
  ).toEqual({
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
  });
});

it('should forward Vertex-supported gs:// tool result files as function response file data', async () => {
  server.urls[GEMINI_3_TEST_URL].response = {
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

  await provider('gemini-3.8-flash').doGenerate({
    prompt: [
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call_1',
            toolName: 'view_files',
            input: { media_ids: ['m1'] },
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call_1',
            toolName: 'view_files',
            output: {
              type: 'content',
              value: [
                { type: 'text', text: 'hero.png activated' },
                {
                  type: 'file',
                  data: {
                    type: 'url',
                    url: new URL('gs://example-bucket/renditions/hero.png'),
                  },
                  mediaType: 'image/png',
                },
              ],
            },
          },
        ],
      },
    ],
  });

  expect((await server.calls[0].requestBodyJson).contents.at(-1)).toEqual({
    role: 'user',
    parts: [
      {
        functionResponse: {
          name: 'view_files',
          response: {
            name: 'view_files',
            content: 'hero.png activated',
          },
          parts: [
            {
              fileData: {
                mimeType: 'image/png',
                fileUri: 'gs://example-bucket/renditions/hero.png',
              },
            },
          ],
        },
      },
    ],
  });
});
