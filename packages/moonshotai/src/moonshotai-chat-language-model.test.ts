import {
  UnsupportedFunctionalityError,
  type LanguageModelV4Prompt,
} from '@ai-sdk/provider';
import { isProviderStreamError } from '@ai-sdk/provider-utils';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { createMoonshotAI } from './moonshotai-provider';

const TEST_PROMPT: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const provider = createMoonshotAI({
  apiKey: 'test-api-key',
});

const server = createTestServer({
  'https://api.moonshot.ai/v1/chat/completions': {},
});

function prepareJsonFixtureResponse(filename: string) {
  server.urls['https://api.moonshot.ai/v1/chat/completions'].response = {
    type: 'json-value',
    body: JSON.parse(
      fs.readFileSync(`src/__fixtures__/${filename}.json`, 'utf8'),
    ),
  };
}

function prepareChunksFixtureResponse(filename: string) {
  const chunks = fs
    .readFileSync(`src/__fixtures__/${filename}.chunks.txt`, 'utf8')
    .split('\n')
    .filter(line => line.length > 0)
    .map(line => `data: ${line}\n\n`);
  chunks.push('data: [DONE]\n\n');

  server.urls['https://api.moonshot.ai/v1/chat/completions'].response = {
    type: 'stream-chunks',
    chunks,
  };
}

describe('doGenerate', () => {
  describe('text', () => {
    beforeEach(() => {
      prepareJsonFixtureResponse('moonshotai-text');
    });

    it('should send correct request body', async () => {
      await provider.chatModel('moonshot-v1-8k').doGenerate({
        prompt: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
        ],
        temperature: 0.5,
        topP: 0.3,
      });

      expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
        {
          "messages": [
            {
              "content": "You are a helpful assistant.",
              "role": "system",
            },
            {
              "content": "Hello",
              "role": "user",
            },
          ],
          "model": "moonshot-v1-8k",
          "temperature": 0.5,
          "top_p": 0.3,
        }
      `);
    });

    it.each([
      'kimi-k2.5',
      'kimi-k2.6',
      'kimi-k2.7-code',
      'kimi-k2.7-code-highspeed',
      'kimi-k3',
    ] as const)(
      'should omit fixed sampling options and warn for %s',
      async modelId => {
        const result = await provider.chatModel(modelId).doGenerate({
          prompt: TEST_PROMPT,
          temperature: 0.2,
          topP: 0.4,
          frequencyPenalty: 0.5,
          presencePenalty: 0.6,
        });

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: modelId,
          messages: [{ role: 'user', content: 'Hello' }],
        });
        expect(result.warnings).toStrictEqual([
          {
            type: 'unsupported',
            feature: 'temperature',
            details: `temperature is fixed by model "${modelId}" and has been omitted.`,
          },
          {
            type: 'unsupported',
            feature: 'topP',
            details: `topP is fixed by model "${modelId}" and has been omitted.`,
          },
          {
            type: 'unsupported',
            feature: 'frequencyPenalty',
            details: `frequencyPenalty is fixed by model "${modelId}" and has been omitted.`,
          },
          {
            type: 'unsupported',
            feature: 'presencePenalty',
            details: `presencePenalty is fixed by model "${modelId}" and has been omitted.`,
          },
        ]);
      },
    );

    it('should preserve sampling options for custom model IDs', async () => {
      await provider.chatModel('custom-model').doGenerate({
        prompt: TEST_PROMPT,
        temperature: 0.2,
        topP: 0.4,
        frequencyPenalty: 0.5,
        presencePenalty: 0.6,
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        model: 'custom-model',
        temperature: 0.2,
        top_p: 0.4,
        frequency_penalty: 0.5,
        presence_penalty: 0.6,
      });
    });

    it('should extract text content, finish reason, and usage', async () => {
      const result = await provider.chatModel('kimi-k3').doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(result.content).toEqual([{ type: 'text', text: 'Hello, world!' }]);
      expect(result.finishReason).toEqual({ unified: 'stop', raw: 'stop' });
      expect(result.usage).toMatchObject({
        inputTokens: { total: 9, noCache: 9, cacheRead: 0 },
        outputTokens: { total: 5, text: 5, reasoning: 0 },
      });
    });
  });

  describe('video input', () => {
    beforeEach(() => {
      prepareJsonFixtureResponse('moonshotai-text');
    });

    it('should send video data parts as video_url data URIs', async () => {
      await provider.chatModel('kimi-k3').doGenerate({
        prompt: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Describe this video' },
              {
                type: 'file',
                data: {
                  type: 'data' as const,
                  data: new Uint8Array([0, 1, 2, 3]),
                },
                mediaType: 'video/mp4',
              },
            ],
          },
        ],
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.messages[0].content).toEqual([
        { type: 'text', text: 'Describe this video' },
        {
          type: 'video_url',
          video_url: { url: 'data:video/mp4;base64,AAECAw==' },
        },
      ]);
    });

    it('should pass through video URL parts', async () => {
      await provider.chatModel('kimi-k3').doGenerate({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                data: {
                  type: 'url' as const,
                  url: new URL('https://example.com/video.mp4'),
                },
                mediaType: 'video/*',
              },
            ],
          },
        ],
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.messages[0].content).toEqual([
        {
          type: 'video_url',
          video_url: { url: 'https://example.com/video.mp4' },
        },
      ]);
    });
  });

  describe('Files API references', () => {
    beforeEach(() => {
      prepareJsonFixtureResponse('moonshotai-text');
    });

    it.each([
      {
        mediaType: 'image',
        content: {
          type: 'image_url',
          image_url: { url: 'ms://file-image' },
        },
      },
      {
        mediaType: 'video',
        content: {
          type: 'video_url',
          video_url: { url: 'ms://file-video' },
        },
      },
    ] as const)(
      'should send ms:// references with top-level $mediaType media types',
      async ({ mediaType, content }) => {
        await provider.chatModel('kimi-k3').doGenerate({
          prompt: [
            {
              role: 'user',
              content: [
                {
                  type: 'file',
                  data: {
                    type: 'url' as const,
                    url: new URL(`ms://file-${mediaType}`),
                  },
                  mediaType,
                },
              ],
            },
          ],
        });

        const requestBody = await server.calls[0].requestBodyJson;
        expect(requestBody.messages[0].content).toEqual([content]);
      },
    );
  });

  describe('thinking options', () => {
    beforeEach(() => {
      prepareJsonFixtureResponse('moonshotai-reasoning');
    });

    it('should omit unsupported budget tokens and warn', async () => {
      const result = await provider.chatModel('kimi-k2.6').doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: {
          moonshotai: {
            thinking: { type: 'enabled', budgetTokens: 2048 },
          },
        },
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.thinking).toStrictEqual({
        type: 'enabled',
      });
      expect(result.warnings).toStrictEqual([
        {
          type: 'deprecated',
          setting: 'providerOptions.moonshotai.thinking.budgetTokens',
          message:
            'Moonshot Chat Completions does not support budget_tokens. Remove budgetTokens; the option has been omitted.',
        },
      ]);
    });

    it('should map reasoningHistory preserved to thinking.keep all', async () => {
      await provider.chatModel('kimi-k2.6').doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: {
          moonshotai: {
            thinking: { type: 'enabled' },
            reasoningHistory: 'preserved',
          },
        },
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.thinking).toStrictEqual({
        type: 'enabled',
        keep: 'all',
      });
      expect(requestBody).not.toHaveProperty('reasoning_history');
    });

    it('should not send reasoning_history for other reasoningHistory values', async () => {
      await provider.chatModel('kimi-k2.6').doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: {
          moonshotai: { reasoningHistory: 'interleaved' },
        },
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody).not.toHaveProperty('reasoning_history');
      expect(requestBody).not.toHaveProperty('thinking');
    });

    it('should pass through reasoning_effort', async () => {
      await provider.chatModel('kimi-k3').doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: {
          moonshotai: { reasoningEffort: 'max' },
        },
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.reasoning_effort).toBe('max');
    });

    it('should map generic reasoning levels to reasoning_effort', async () => {
      await provider.chatModel('kimi-k3').doGenerate({
        prompt: TEST_PROMPT,
        reasoning: 'low',
      });
      expect((await server.calls[0].requestBodyJson).reasoning_effort).toBe(
        'low',
      );

      await provider.chatModel('kimi-k3').doGenerate({
        prompt: TEST_PROMPT,
        reasoning: 'xhigh',
      });
      expect((await server.calls[1].requestBodyJson).reasoning_effort).toBe(
        'max',
      );
    });

    it('should prefer explicit reasoningEffort over generic reasoning', async () => {
      await provider.chatModel('kimi-k3').doGenerate({
        prompt: TEST_PROMPT,
        reasoning: 'low',
        providerOptions: {
          moonshotai: { reasoningEffort: 'high' },
        },
      });

      expect((await server.calls[0].requestBodyJson).reasoning_effort).toBe(
        'high',
      );
    });

    it('should warn and omit reasoning_effort for reasoning none', async () => {
      const result = await provider.chatModel('kimi-k3').doGenerate({
        prompt: TEST_PROMPT,
        reasoning: 'none',
      });

      expect(
        (await server.calls[0].requestBodyJson).reasoning_effort,
      ).toBeUndefined();
      expect(result.warnings).toEqual([
        {
          type: 'unsupported',
          feature: 'reasoning "none"',
          details: 'Kimi K3 reasoning cannot be disabled.',
        },
      ]);
    });

    it('should omit thinking for Kimi K3', async () => {
      const result = await provider.chatModel('kimi-k3').doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: {
          moonshotai: {
            thinking: { type: 'disabled' },
            reasoningHistory: 'preserved',
          },
        },
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody).not.toHaveProperty('thinking');
      expect(result.warnings).toStrictEqual([
        {
          type: 'unsupported',
          feature: 'thinking',
          details:
            'Kimi K3 always reasons and does not accept the thinking field. The option has been omitted.',
        },
      ]);
    });

    it.each(['kimi-k2.7-code', 'kimi-k2.7-code-highspeed'] as const)(
      'should not disable thinking for %s',
      async modelId => {
        const result = await provider.chatModel(modelId).doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            moonshotai: { thinking: { type: 'disabled' } },
          },
        });

        expect(await server.calls[0].requestBodyJson).not.toHaveProperty(
          'thinking',
        );
        expect(result.warnings).toStrictEqual([
          {
            type: 'unsupported',
            feature: 'thinking.type "disabled"',
            details: 'Kimi K2.7 thinking cannot be disabled.',
          },
        ]);
      },
    );

    it('should rely on K2.7 preserved-thinking defaults', async () => {
      const result = await provider.chatModel('kimi-k2.7-code').doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: {
          moonshotai: { reasoningHistory: 'preserved' },
        },
      });

      expect(await server.calls[0].requestBodyJson).not.toHaveProperty(
        'thinking',
      );
      expect(result.warnings).toStrictEqual([]);
    });

    it.each(['kimi-k2.5', 'kimi-k2.6'] as const)(
      'should map generic reasoning to thinking for %s',
      async modelId => {
        await provider.chatModel(modelId).doGenerate({
          prompt: TEST_PROMPT,
          reasoning: 'low',
        });
        expect((await server.calls[0].requestBodyJson).thinking).toStrictEqual({
          type: 'enabled',
        });

        await provider.chatModel(modelId).doGenerate({
          prompt: TEST_PROMPT,
          reasoning: 'none',
        });
        expect((await server.calls[1].requestBodyJson).thinking).toStrictEqual({
          type: 'disabled',
        });
      },
    );

    it('should omit reasoning effort for K2 models and warn', async () => {
      const result = await provider.chatModel('kimi-k2.6').doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: {
          moonshotai: { reasoningEffort: 'high' },
        },
      });

      expect(await server.calls[0].requestBodyJson).not.toHaveProperty(
        'reasoning_effort',
      );
      expect(result.warnings).toStrictEqual([
        {
          type: 'unsupported',
          feature: 'reasoningEffort',
          details:
            'reasoningEffort is only supported by Kimi K3 and has been omitted for model "kimi-k2.6".',
        },
      ]);
    });

    it('should omit thinking and reasoning for Moonshot V1', async () => {
      const result = await provider.chatModel('moonshot-v1-8k').doGenerate({
        prompt: TEST_PROMPT,
        reasoning: 'high',
        providerOptions: {
          moonshotai: {
            reasoningEffort: 'high',
            thinking: { type: 'enabled' },
            reasoningHistory: 'preserved',
          },
        },
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody).not.toHaveProperty('reasoning_effort');
      expect(requestBody).not.toHaveProperty('thinking');
      expect(result.warnings).toStrictEqual([
        {
          type: 'unsupported',
          feature: 'reasoningEffort',
          details:
            'reasoningEffort is only supported by Kimi K3 and has been omitted for model "moonshot-v1-8k".',
        },
        {
          type: 'unsupported',
          feature: 'thinking',
          details:
            'thinking is not supported by model "moonshot-v1-8k" and has been omitted.',
        },
        {
          type: 'unsupported',
          feature: 'reasoning',
          details: 'reasoning is not supported by model "moonshot-v1-8k".',
        },
        {
          type: 'unsupported',
          feature:
            'reasoningHistory \'preserved\' is not supported by model "moonshot-v1-8k"',
        },
      ]);
    });

    it('should omit thinking.keep and warn on models without keep support', async () => {
      const result = await provider.chatModel('kimi-k2.5').doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: {
          moonshotai: { reasoningHistory: 'preserved' },
        },
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody).not.toHaveProperty('thinking');
      expect(requestBody).not.toHaveProperty('reasoning_history');
      expect(result.warnings).toEqual([
        {
          type: 'unsupported',
          feature: `reasoningHistory 'preserved' is not supported by model "kimi-k2.5"`,
        },
      ]);
    });

    it('should extract reasoning content and remap usage', async () => {
      const result = await provider.chatModel('kimi-k2.6').doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(result.content).toEqual([
        { type: 'reasoning', text: 'Let me count the letters carefully.' },
        { type: 'text', text: 'There are three.' },
      ]);
      expect(result.usage).toMatchObject({
        inputTokens: { total: 20, noCache: 10, cacheRead: 10 },
        outputTokens: { total: 30, text: 8, reasoning: 22 },
      });
    });
  });

  describe('structured outputs', () => {
    beforeEach(() => {
      prepareJsonFixtureResponse('moonshotai-text');
    });

    it('should normalize json schemas and enable strict validation by default', async () => {
      await provider.chatModel('kimi-k3').doGenerate({
        prompt: TEST_PROMPT,
        responseFormat: {
          type: 'json',
          name: 'recipe',
          description: 'A recipe response.',
          schema: {
            $schema: 'http://json-schema.org/draft-07/schema#',
            type: 'object',
            properties: {
              ingredients: {
                type: 'array',
                items: [{ type: 'string' }, { type: 'number' }],
              },
            },
          },
        },
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.response_format).toStrictEqual({
        type: 'json_schema',
        json_schema: {
          name: 'recipe',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              ingredients: {
                type: 'array',
                prefixItems: [{ type: 'string' }, { type: 'number' }],
              },
            },
          },
        },
      });
    });

    it('should allow strict json schema validation to be disabled', async () => {
      await provider.chatModel('kimi-k3').doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: {
          moonshotai: {
            strictJsonSchema: false,
          },
        },
        responseFormat: {
          type: 'json',
          schema: {
            type: 'object',
            properties: { name: { type: 'string' } },
          },
        },
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.response_format).toStrictEqual({
        type: 'json_schema',
        json_schema: {
          name: 'response',
          strict: false,
          schema: {
            type: 'object',
            properties: { name: { type: 'string' } },
          },
        },
      });
    });

    it('should fall back to json_object without a schema', async () => {
      await provider.chatModel('kimi-k3').doGenerate({
        prompt: TEST_PROMPT,
        responseFormat: { type: 'json' },
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.response_format).toStrictEqual({
        type: 'json_object',
      });
    });

    it('should fall back to json_object for models without structured outputs', async () => {
      await provider.chatModel('moonshot-v1-8k').doGenerate({
        prompt: TEST_PROMPT,
        responseFormat: {
          type: 'json',
          schema: { type: 'object', properties: {} },
        },
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.response_format).toStrictEqual({
        type: 'json_object',
      });
    });
  });

  describe('tool calls', () => {
    beforeEach(() => {
      prepareJsonFixtureResponse('moonshotai-tool-call');
    });

    it.each([
      'kimi-k2.6',
      'kimi-k2.7-code',
      'kimi-k2.7-code-highspeed',
    ] as const)(
      'should omit required tool choice and warn for %s',
      async modelId => {
        const result = await provider.chatModel(modelId).doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'function',
              name: 'get_weather',
              description: 'Get the weather',
              inputSchema: { type: 'object', properties: {} },
            },
          ],
          toolChoice: { type: 'required' },
        });

        expect(await server.calls[0].requestBodyJson).not.toHaveProperty(
          'tool_choice',
        );
        expect(result.warnings).toStrictEqual([
          {
            type: 'unsupported',
            feature: `tool choice "required" for model "${modelId}"`,
            details:
              'Moonshot AI rejects required tool choice for this model. The setting has been omitted; use "auto" or select a specific tool instead.',
          },
        ]);
      },
    );

    it.each(['kimi-k3', 'custom-kimi-model'] as const)(
      'should preserve required tool choice for %s',
      async modelId => {
        const result = await provider.chatModel(modelId).doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'function',
              name: 'get_weather',
              description: 'Get the weather',
              inputSchema: { type: 'object', properties: {} },
            },
          ],
          toolChoice: { type: 'required' },
        });

        expect((await server.calls[0].requestBodyJson).tool_choice).toBe(
          'required',
        );
        expect(result.warnings).toStrictEqual([]);
      },
    );

    it('should normalize tuple tool schemas to prefixItems on the wire', async () => {
      await provider.chatModel('kimi-k3').doGenerate({
        prompt: TEST_PROMPT,
        tools: [
          {
            type: 'function',
            name: 'probe',
            description: 'probe',
            inputSchema: {
              type: 'object',
              properties: {
                a: {
                  type: 'array',
                  items: [{ type: 'number' }, { type: 'number' }],
                },
              },
              required: ['a'],
            },
          },
        ],
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.tools[0].function.parameters).toStrictEqual({
        type: 'object',
        properties: {
          a: {
            type: 'array',
            prefixItems: [{ type: 'number' }, { type: 'number' }],
          },
        },
        required: ['a'],
      });
    });

    it('should extract tool calls and finish reason', async () => {
      const result = await provider.chatModel('kimi-k3').doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(result.content).toEqual([
        {
          type: 'tool-call',
          toolCallId: 'call_abc123',
          toolName: 'get_weather',
          input: '{"city":"Paris"}',
        },
      ]);
      expect(result.finishReason).toEqual({
        unified: 'tool-calls',
        raw: 'tool_calls',
      });
    });
  });

  describe('warnings', () => {
    beforeEach(() => {
      prepareJsonFixtureResponse('moonshotai-text');
    });

    it('should warn for unsupported topK and seed', async () => {
      const result = await provider.chatModel('kimi-k3').doGenerate({
        prompt: TEST_PROMPT,
        topK: 5,
        seed: 42,
      });

      expect(result.warnings).toEqual([
        { type: 'unsupported', feature: 'topK' },
        { type: 'unsupported', feature: 'seed' },
      ]);
    });
  });

  describe('provider options passthrough', () => {
    beforeEach(() => {
      prepareJsonFixtureResponse('moonshotai-text');
    });

    it('should forward promptCacheKey and safetyIdentifier', async () => {
      await provider.chatModel('kimi-k3').doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: {
          moonshotai: {
            promptCacheKey: 'session-42',
            safetyIdentifier: 'user-hash-7',
          },
        },
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.prompt_cache_key).toBe('session-42');
      expect(requestBody.safety_identifier).toBe('user-hash-7');
    });
  });

  describe('supportedUrls', () => {
    it('should natively support ms:// file references', () => {
      expect(provider.chatModel('kimi-k3').supportedUrls).toEqual({
        'image/*': [/^ms:\/\//],
        'video/*': [/^ms:\/\//],
      });
    });
  });

  describe('errors', () => {
    it('should reject unsupported media before sending a request', async () => {
      await expect(
        provider.chatModel('kimi-k3').doGenerate({
          prompt: [
            {
              role: 'user',
              content: [
                {
                  type: 'file',
                  data: {
                    type: 'data' as const,
                    data: new TextEncoder().encode('<svg></svg>'),
                  },
                  mediaType: 'image/svg+xml',
                },
              ],
            },
          ],
        }),
      ).rejects.toSatisfy(UnsupportedFunctionalityError.isInstance);

      expect(server.calls).toHaveLength(0);
    });

    it('should map the moonshot error envelope', async () => {
      server.urls['https://api.moonshot.ai/v1/chat/completions'].response = {
        type: 'error',
        status: 400,
        body: JSON.stringify({
          error: {
            message: 'Invalid request: invalid part type: file',
            type: 'invalid_request_error',
          },
        }),
      };

      await expect(
        provider.chatModel('kimi-k3').doGenerate({ prompt: TEST_PROMPT }),
      ).rejects.toThrow('Invalid request: invalid part type: file');
    });
  });
});

describe('doStream', () => {
  it('should preserve a provider error envelope in stream errors', async () => {
    const data = {
      error: {
        message: 'Internal server error',
        type: 'server_error',
      },
    };

    server.urls['https://api.moonshot.ai/v1/chat/completions'].response = {
      type: 'stream-chunks',
      chunks: [`data: ${JSON.stringify(data)}\n\n`, 'data: [DONE]\n\n'],
    };

    const result = await provider.chatModel('kimi-k3').doStream({
      prompt: TEST_PROMPT,
    });
    const chunks = await convertReadableStreamToArray(result.stream);
    const errorPart = chunks.find(chunk => chunk.type === 'error');

    expect(errorPart?.type).toBe('error');
    if (errorPart?.type !== 'error') {
      expect.fail('Expected an error part');
    }

    expect(isProviderStreamError(errorPart.error)).toBe(true);
    expect(errorPart.error).toMatchObject({
      message: 'Internal server error',
      type: 'server_error',
      statusCode: 500,
      isRetryable: true,
      data,
    });
  });

  it('should stream reasoning and text deltas with usage', async () => {
    prepareChunksFixtureResponse('moonshotai-stream');

    const result = await provider.chatModel('kimi-k3').doStream({
      prompt: TEST_PROMPT,
    });

    const parts = await convertReadableStreamToArray(result.stream);

    expect(parts[0]).toEqual({ type: 'stream-start', warnings: [] });
    expect(parts).toContainEqual({
      type: 'reasoning-start',
      id: 'reasoning-0',
    });
    expect(parts).toContainEqual({
      type: 'reasoning-delta',
      id: 'reasoning-0',
      delta: 'Thinking ',
    });
    expect(parts).toContainEqual({
      type: 'reasoning-end',
      id: 'reasoning-0',
    });
    expect(parts).toContainEqual({ type: 'text-start', id: 'txt-0' });
    expect(parts).toContainEqual({
      type: 'text-delta',
      id: 'txt-0',
      delta: 'Hello',
    });
    expect(parts).toContainEqual({ type: 'text-end', id: 'txt-0' });

    const finish = parts.at(-1);
    expect(finish).toMatchObject({
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: {
        inputTokens: { total: 9 },
        outputTokens: { total: 12, reasoning: 7 },
      },
    });
  });

  it('should include stream options with usage', async () => {
    prepareChunksFixtureResponse('moonshotai-stream');

    await provider.chatModel('kimi-k3').doStream({ prompt: TEST_PROMPT });

    const requestBody = await server.calls[0].requestBodyJson;
    expect(requestBody.stream).toBe(true);
    expect(requestBody.stream_options).toStrictEqual({
      include_usage: true,
    });
  });
});
