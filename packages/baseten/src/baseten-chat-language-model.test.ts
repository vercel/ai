import type { JSONSchema7, LanguageModelV3CallOptions } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createBaseten } from './baseten-provider';

const modelId = 'deepseek-ai/DeepSeek-V4-Pro-0813';
const url = 'https://inference.baseten.co/v1/chat/completions';
const modelURL = 'https://model-123.api.baseten.co/sync/v1';
const dedicatedUrl = `${modelURL}/chat/completions`;
const schema = {
  type: 'object',
  properties: { answer: { type: 'string' } },
  required: ['answer'],
  additionalProperties: false,
} satisfies JSONSchema7;
const prompt: LanguageModelV3CallOptions['prompt'] = [
  { role: 'system', content: 'You are a helpful assistant.' },
  { role: 'user', content: [{ type: 'text', text: 'Reply with PONG.' }] },
];
const server = createTestServer({ [url]: {}, [dedicatedUrl]: {} });

describe.each(['doGenerate', 'doStream'] as const)('%s', method => {
  beforeEach(() => {
    for (const endpoint of [url, dedicatedUrl] as const) {
      server.urls[endpoint].response =
        method === 'doGenerate'
          ? {
              type: 'json-value',
              body: {
                choices: [
                  {
                    message: { content: '{"answer":"PONG"}' },
                    finish_reason: 'stop',
                  },
                ],
              },
            }
          : {
              type: 'stream-chunks',
              chunks: [
                `data: ${JSON.stringify({
                  choices: [
                    {
                      index: 0,
                      delta: { content: '{"answer":"PONG"}' },
                      finish_reason: 'stop',
                    },
                  ],
                })}\n\n`,
                'data: [DONE]\n\n',
              ],
            };
    }
  });

  async function callModel({
    options = {},
    id = modelId,
    dedicated = false,
  }: {
    options?: Partial<LanguageModelV3CallOptions>;
    id?: string;
    dedicated?: boolean;
  } = {}) {
    const model = createBaseten({
      apiKey: 'test-api-key',
      ...(dedicated ? { modelURL } : {}),
    })(id);
    const result = await model[method]({
      prompt,
      responseFormat: { type: 'json', schema },
      providerOptions: { baseten: { reasoningEffort: 'high' } },
      ...options,
    });
    const warnings =
      'stream' in result
        ? (await convertReadableStreamToArray(result.stream)).find(
            part => part.type === 'stream-start',
          )?.warnings
        : result.warnings;
    return { body: await server.calls[0].requestBodyJson, warnings };
  }

  it('should use the schema in the prompt without JSON mode when reasoning is enabled', async () => {
    const { body, warnings } = await callModel();

    expect(body.response_format).toBeUndefined();
    expect(body.reasoning_effort).toBe('high');
    expect(body.messages[0]).toEqual({
      role: 'system',
      content: expect.stringContaining(JSON.stringify(schema)),
    });
    expect(body.messages.slice(1)).toEqual([
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Reply with PONG.' },
    ]);
    expect(warnings).toContainEqual({
      type: 'compatibility',
      feature: 'responseFormat',
      details: expect.stringContaining('injected into the system message'),
    });
  });

  it('should omit JSON mode without a schema when reasoning uses its default', async () => {
    const { body } = await callModel({
      options: { responseFormat: { type: 'json' }, providerOptions: undefined },
    });

    expect(body.response_format).toBeUndefined();
    expect(body.reasoning_effort).toBeUndefined();
    expect(body.messages[0]).toEqual({
      role: 'system',
      content: 'You MUST answer with JSON.',
    });
  });

  it.each([
    { providerOptions: { baseten: { reasoningEffort: 'none' } } },
    {
      providerOptions: { baseten: { reasoning_effort: 'none' } },
    },
  ])(
    'should retain JSON Schema when reasoning is disabled with %j',
    async options => {
      const { body, warnings } = await callModel({ options });

      expect(body.response_format).toMatchObject({ type: 'json_schema' });
      expect(body.reasoning_effort).toBe('none');
      expect(body.messages).toHaveLength(2);
      expect(warnings).toEqual([]);
    },
  );

  it('should leave text requests unchanged', async () => {
    const { body, warnings } = await callModel({
      options: { responseFormat: { type: 'text' } },
    });

    expect(body.response_format).toBeUndefined();
    expect(body.messages).toHaveLength(2);
    expect(warnings).toEqual([]);
  });

  it('should retain JSON Schema for other models', async () => {
    const { body, warnings } = await callModel({ id: 'zai-org/GLM-4.7' });

    expect(body.response_format).toMatchObject({ type: 'json_schema' });
    expect(body.messages).toHaveLength(2);
    expect(warnings).toEqual([]);
  });

  it('should leave dedicated deployments unchanged', async () => {
    const { body, warnings } = await callModel({ dedicated: true });

    expect(body.response_format).toMatchObject({ type: 'json_schema' });
    expect(body.messages).toHaveLength(2);
    expect(warnings).toEqual([]);
  });
});
