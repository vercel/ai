import type { JSONSchema7, LanguageModelV4Prompt } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { expect, it, vi } from 'vitest';
import { createGoogleVertex } from './google-vertex-provider-base';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const TEST_URL =
  'https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.5-flash:generateContent';

const futureModelIds = [
  'gemini-4.0-flash',
  'gemini-future-latest',
  'models/gemini-4.0-flash',
];
const futureBaseURL =
  'https://us-central1-aiplatform.googleapis.com/v1beta1/projects/test-project/locations/us-central1/publishers/google';

const server = createTestServer({
  [TEST_URL]: {},
  ...Object.fromEntries(
    futureModelIds.map(modelId => [
      `${futureBaseURL}/${modelId.includes('/') ? modelId : `models/${modelId}`}:generateContent`,
      {},
    ]),
  ),
});

const TEST_PROMPT: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

it.each(futureModelIds)(
  'should send current tools and thinking config for %s through Vertex',
  async modelId => {
    server.urls[
      `${futureBaseURL}/${modelId.includes('/') ? modelId : `models/${modelId}`}:generateContent`
    ].response = {
      type: 'json-value',
      body: {
        candidates: [
          {
            content: { parts: [{ text: 'Done' }], role: 'model' },
            finishReason: 'STOP',
          },
        ],
      },
    };

    const provider = createGoogleVertex({
      project: 'test-project',
      location: 'us-central1',
      headers: { Authorization: 'Bearer test-token' },
    });
    const result = await provider(modelId).doGenerate({
      prompt: TEST_PROMPT,
      reasoning: 'high',
      tools: [
        ...[
          'google.google_search',
          'google.enterprise_web_search',
          'google.url_context',
          'google.code_execution',
          'google.file_search',
          'google.vertex_rag_store',
        ].map(id => ({
          type: 'provider' as const,
          id: id as `google.${string}`,
          name: id,
          args: {},
        })),
        {
          type: 'function',
          name: 'lookup',
          inputSchema: { type: 'object', properties: {} },
        },
      ],
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      generationConfig: { thinkingConfig: { thinkingLevel: 'high' } },
      tools: [
        { googleSearch: {} },
        { enterpriseWebSearch: {} },
        { urlContext: {} },
        { codeExecution: {} },
        { fileSearch: {} },
        { retrieval: { vertex_rag_store: {} } },
        { functionDeclarations: [{ name: 'lookup' }] },
      ],
      toolConfig: { functionCallingConfig: { mode: 'VALIDATED' } },
    });
    expect(result.warnings).toEqual([]);
  },
);

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
