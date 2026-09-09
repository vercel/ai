import {
  APICallError,
  UnsupportedFunctionalityError,
  type LanguageModelV4Prompt,
} from '@ai-sdk/provider';
import { isProviderStreamError } from '@ai-sdk/provider-utils';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import type {
  MoonshotAIAssistantMessageProviderOptions,
  MoonshotAILanguageModelOptions,
  MoonshotAIMessageProviderOptions,
} from './moonshotai-chat-options';
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

function readJsonFixture(filename: string) {
  return JSON.parse(
    fs.readFileSync(`src/__fixtures__/${filename}.json`, 'utf8'),
  );
}

function prepareJsonFixtureResponse(filename: string) {
  server.urls['https://api.moonshot.ai/v1/chat/completions'].response = {
    type: 'json-value',
    body: readJsonFixture(filename),
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

async function getStreamParts(filename: string) {
  prepareChunksFixtureResponse(filename);

  const result = await provider.chatModel('kimi-k3').doStream({
    prompt: TEST_PROMPT,
  });

  return convertReadableStreamToArray(result.stream);
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

    it('should send message names', async () => {
      await provider.chatModel('kimi-k3').doGenerate({
        prompt: [
          {
            role: 'system',
            content: 'You are a helpful assistant.',
            providerOptions: {
              moonshotai: {
                name: 'guide',
              } satisfies MoonshotAIMessageProviderOptions,
            },
          },
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
            providerOptions: {
              moonshotai: {
                name: 'alice',
              } satisfies MoonshotAIMessageProviderOptions,
            },
          },
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'Hello, Alice.' }],
            providerOptions: {
              moonshotai: {
                name: 'assistant',
              } satisfies MoonshotAIMessageProviderOptions,
            },
          },
        ],
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant.',
            name: 'guide',
          },
          { role: 'user', content: 'Hello', name: 'alice' },
          {
            role: 'assistant',
            content: 'Hello, Alice.',
            name: 'assistant',
          },
        ],
      });
    });

    it('should send maxOutputTokens as max_completion_tokens', async () => {
      await provider.chatModel('kimi-k3').doGenerate({
        prompt: TEST_PROMPT,
        maxOutputTokens: 17,
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.max_completion_tokens).toBe(17);
      expect(requestBody).not.toHaveProperty('max_tokens');
    });

    it('should omit max_completion_tokens when maxOutputTokens is undefined', async () => {
      await provider.chatModel('kimi-k3').doGenerate({
        prompt: TEST_PROMPT,
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody).not.toHaveProperty('max_completion_tokens');
      expect(requestBody).not.toHaveProperty('max_tokens');
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

    it.each([null, undefined])(
      'should tolerate %s response metadata fields',
      async metadataValue => {
        const responseBody = JSON.parse(
          fs.readFileSync('src/__fixtures__/moonshotai-text.json', 'utf8'),
        );
        responseBody.object = metadataValue;
        responseBody.choices[0].index = metadataValue;
        responseBody.choices[0].message.role = metadataValue;

        if (metadataValue === undefined) {
          delete responseBody.object;
          delete responseBody.choices[0].index;
          delete responseBody.choices[0].message.role;
        }

        server.urls['https://api.moonshot.ai/v1/chat/completions'].response = {
          type: 'json-value',
          body: responseBody,
        };

        const result = await provider.chatModel('kimi-k3').doGenerate({
          prompt: TEST_PROMPT,
        });

        expect(result.providerMetadata).toEqual({ moonshotai: {} });
      },
    );

    it('should preserve extra top-level and nested fields in raw usage', async () => {
      server.urls['https://api.moonshot.ai/v1/chat/completions'].response = {
        type: 'json-value',
        body: {
          id: 'chatcmpl-raw-usage',
          object: 'chat.completion',
          created: 1785880000,
          model: 'kimi-k3',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'Hello' },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 50,
            total_tokens: 150,
            cached_tokens: 20,
            provider_usage_id: 'usage-123',
            prompt_tokens_details: {
              cached_tokens: 20,
              cache_type: 'ephemeral',
            },
            completion_tokens_details: {
              reasoning_tokens: 10,
              billable_tokens: 42,
            },
          },
        },
      };

      const result = await provider.chatModel('kimi-k3').doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(result.usage).toMatchObject({
        inputTokens: { total: 100, noCache: 80, cacheRead: 20 },
        outputTokens: { total: 50, text: 40, reasoning: 10 },
        raw: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
          cached_tokens: 20,
          provider_usage_id: 'usage-123',
          prompt_tokens_details: {
            cached_tokens: 20,
            cache_type: 'ephemeral',
          },
          completion_tokens_details: {
            reasoning_tokens: 10,
            billable_tokens: 42,
          },
        },
      });
    });

    it('should continue validating known usage field types', async () => {
      server.urls['https://api.moonshot.ai/v1/chat/completions'].response = {
        type: 'json-value',
        body: {
          id: 'chatcmpl-invalid-usage',
          created: 1785880000,
          model: 'kimi-k3',
          choices: [
            {
              message: { role: 'assistant', content: 'Hello' },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: '100',
            completion_tokens: 50,
            total_tokens: 150,
          },
        },
      };

      await expect(
        provider.chatModel('kimi-k3').doGenerate({ prompt: TEST_PROMPT }),
      ).rejects.toThrow();
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

  describe('file data', () => {
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

    it('should send text data and Moonshot provider references as native content parts', async () => {
      await provider.chatModel('kimi-k2.6').doGenerate({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                data: { type: 'text', text: 'inline document text' },
                mediaType: 'text/plain',
              },
              {
                type: 'file',
                data: {
                  type: 'reference',
                  reference: { moonshotai: 'ms://image-file-123' },
                },
                mediaType: 'image/png',
              },
              {
                type: 'file',
                data: {
                  type: 'reference',
                  reference: { moonshotai: 'ms://video-file-123' },
                },
                mediaType: 'video/mp4',
              },
            ],
          },
        ],
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.messages[0].content).toEqual([
        { type: 'text', text: 'inline document text' },
        {
          type: 'image_url',
          image_url: { url: 'ms://image-file-123' },
        },
        {
          type: 'video_url',
          video_url: { url: 'ms://video-file-123' },
        },
      ]);
    });
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

    it.each([
      'moonshot-v1-8k',
      'moonshot-v1-32k',
      'moonshot-v1-128k',
      'moonshot-v1-auto',
      'moonshot-v1-8k-vision-preview',
      'moonshot-v1-32k-vision-preview',
      'moonshot-v1-128k-vision-preview',
    ])('should use json_schema for %s', async modelId => {
      await provider.chatModel(modelId).doGenerate({
        prompt: TEST_PROMPT,
        responseFormat: {
          type: 'json',
          name: 'response',
          schema: { type: 'object', properties: {} },
        },
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.response_format).toStrictEqual({
        type: 'json_schema',
        json_schema: {
          name: 'response',
          schema: { type: 'object', properties: {} },
          strict: true,
        },
      });
    });

    it('should fall back to json_object for unknown models', async () => {
      await provider.chatModel('custom-model-id').doGenerate({
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

  describe('Partial Mode', () => {
    beforeEach(() => {
      prepareJsonFixtureResponse('moonshotai-text');
    });

    it('should send partial true on the final assistant message', async () => {
      await provider.chatModel('kimi-k3').doGenerate({
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Continue this prefix.' }],
          },
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'The sky is' }],
            providerOptions: {
              moonshotai: {
                name: 'writer',
                partial: true,
              } satisfies MoonshotAIAssistantMessageProviderOptions,
            },
          },
        ],
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        messages: [
          { role: 'user', content: 'Continue this prefix.' },
          {
            role: 'assistant',
            content: 'The sky is',
            name: 'writer',
            partial: true,
          },
        ],
      });
    });

    it('should reject Partial Mode with JSON object response format before the API call', async () => {
      await expect(
        provider.chatModel('kimi-k3').doGenerate({
          prompt: [
            {
              role: 'assistant',
              content: [{ type: 'text', text: '{' }],
              providerOptions: {
                moonshotai: {
                  partial: true,
                } satisfies MoonshotAIAssistantMessageProviderOptions,
              },
            },
          ],
          responseFormat: { type: 'json' },
        }),
      ).rejects.toThrow(
        'Moonshot AI Partial Mode cannot be combined with JSON object response format.',
      );

      expect(server.calls).toHaveLength(0);
    });

    it('should allow Partial Mode with JSON schema response format', async () => {
      await provider.chatModel('kimi-k3').doGenerate({
        prompt: [
          {
            role: 'assistant',
            content: [{ type: 'text', text: '{' }],
            providerOptions: {
              moonshotai: {
                partial: true,
              } satisfies MoonshotAIAssistantMessageProviderOptions,
            },
          },
        ],
        responseFormat: {
          type: 'json',
          name: 'result',
          schema: {
            type: 'object',
            properties: { answer: { type: 'string' } },
          },
        },
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.messages[0]).toMatchObject({ partial: true });
      expect(requestBody.response_format).toMatchObject({
        type: 'json_schema',
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
      expect(result.providerMetadata).toEqual({
        moonshotai: {
          responseObject: 'chat.completion',
          choiceIndex: 0,
          messageRole: 'assistant',
          toolCallTypes: ['function'],
        },
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

    it('should warn when a message name is set on a tool message', async () => {
      const result = await provider.chatModel('kimi-k3').doGenerate({
        prompt: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call-1',
                toolName: 'weather',
                output: { type: 'text', value: 'sunny' },
              },
            ],
            providerOptions: {
              moonshotai: {
                name: 'weather_tool',
              } satisfies MoonshotAIMessageProviderOptions,
            },
          },
        ],
      });

      expect(result.warnings).toContainEqual({
        type: 'unsupported',
        feature: 'message name on tool messages',
      });
      expect(
        (await server.calls[0].requestBodyJson).messages[0],
      ).not.toHaveProperty('name');
    });
  });

  describe('provider options passthrough', () => {
    beforeEach(() => {
      prepareJsonFixtureResponse('moonshotai-text');
    });

    it('should forward string predicted content unchanged', async () => {
      await provider.chatModel('kimi-k3').doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: {
          moonshotai: {
            prediction: {
              type: 'content',
              content: 'Hello, world!',
            },
          },
        },
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.prediction).toStrictEqual({
        type: 'content',
        content: 'Hello, world!',
      });
    });

    it('should omit prediction when it is not configured', async () => {
      await provider.chatModel('kimi-k3').doGenerate({
        prompt: TEST_PROMPT,
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody).not.toHaveProperty('prediction');
    });

    it.each([
      {
        type: 'text',
        content: 'Hello, world!',
      },
      {
        type: 'content',
        content: [{ type: 'image', text: 'Hello, world!' }],
      },
      {
        type: 'content',
        content: 123,
      },
    ])(
      'should reject invalid predicted content before making a request',
      async prediction => {
        await expect(
          provider.chatModel('kimi-k3').doGenerate({
            prompt: TEST_PROMPT,
            providerOptions: {
              moonshotai: { prediction },
            },
          }),
        ).rejects.toMatchObject({
          name: 'AI_InvalidArgumentError',
          argument: 'providerOptions',
          message: 'invalid moonshotai provider options',
        });

        expect(server.calls).toHaveLength(0);
      },
    );

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

  describe('dynamic tool loading', () => {
    beforeEach(() => {
      prepareJsonFixtureResponse('moonshotai-tool-call');
    });

    it('should send normalized dynamic tools in a K3 system message', async () => {
      await provider.chatModel('kimi-k3').doGenerate({
        prompt: [
          { role: 'user', content: [{ type: 'text', text: 'Calculate.' }] },
          {
            role: 'system',
            content: '',
            providerOptions: {
              moonshotai: {
                tools: [
                  {
                    type: 'function',
                    name: 'calculator',
                    description: 'Evaluate an expression',
                    inputSchema: {
                      type: 'object',
                      properties: {
                        values: {
                          type: 'array',
                          items: [{ type: 'number' }, { type: 'number' }],
                        },
                      },
                    },
                  },
                ],
              },
            },
          },
        ],
      });

      expect((await server.calls[0].requestBodyJson).messages.at(-1)).toEqual({
        role: 'system',
        tools: [
          {
            type: 'function',
            function: {
              name: 'calculator',
              description: 'Evaluate an expression',
              parameters: {
                type: 'object',
                properties: {
                  values: {
                    type: 'array',
                    prefixItems: [{ type: 'number' }, { type: 'number' }],
                  },
                },
              },
            },
          },
        ],
      });
    });

    it('should omit dynamic messages and warn for non-K3 official models', async () => {
      const result = await provider.chatModel('kimi-k2.6').doGenerate({
        prompt: [
          {
            role: 'system',
            content: '',
            providerOptions: {
              moonshotai: {
                tools: [
                  {
                    type: 'function',
                    name: 'calculator',
                    inputSchema: { type: 'object', properties: {} },
                  },
                ],
              },
            },
          },
        ],
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        messages: [],
      });
      expect(result.warnings).toContainEqual({
        type: 'unsupported',
        feature: 'dynamic tool loading for model "kimi-k2.6"',
        details:
          'Moonshot documents dynamic tool loading only for Kimi K3. The dynamic system message has been omitted.',
      });
    });

    it('should preserve dynamic messages for unknown custom models', async () => {
      await provider.chatModel('custom-model').doGenerate({
        prompt: [
          {
            role: 'system',
            content: '',
            providerOptions: {
              moonshotai: {
                tools: [
                  {
                    type: 'function',
                    name: 'calculator',
                    inputSchema: { type: 'object', properties: {} },
                  },
                ],
              },
            },
          },
        ],
      });

      expect((await server.calls[0].requestBodyJson).messages[0]).toMatchObject(
        {
          role: 'system',
          tools: [{ function: { name: 'calculator' } }],
        },
      );
    });
  });

  describe('logprobs', () => {
    beforeEach(() => {
      prepareJsonFixtureResponse('moonshotai-logprobs');
    });

    it('should send logprobs provider options', async () => {
      await provider.chatModel('moonshot-v1-8k').doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: {
          moonshotai: {
            logprobs: true,
            topLogprobs: 20,
          } satisfies MoonshotAILanguageModelOptions,
        },
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        logprobs: true,
        top_logprobs: 20,
      });
    });

    it('should enable logprobs when topLogprobs is set', async () => {
      await provider.chatModel('moonshot-v1-8k').doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: {
          moonshotai: {
            topLogprobs: 0,
          } satisfies MoonshotAILanguageModelOptions,
        },
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        logprobs: true,
        top_logprobs: 0,
      });
    });

    it.each([-1, 1.5, 21])(
      'should reject invalid topLogprobs value %s',
      async topLogprobs => {
        await expect(
          provider.chatModel('moonshot-v1-8k').doGenerate({
            prompt: TEST_PROMPT,
            providerOptions: {
              moonshotai: {
                topLogprobs,
              } satisfies MoonshotAILanguageModelOptions,
            },
          }),
        ).rejects.toMatchObject({
          name: 'AI_InvalidArgumentError',
          argument: 'providerOptions',
          message: 'invalid moonshotai provider options',
        });

        expect(server.calls).toHaveLength(0);
      },
    );

    it('should expose logprobs in provider metadata without changing text', async () => {
      const result = await provider.chatModel('moonshot-v1-8k').doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: {
          moonshotai: {
            logprobs: true,
          } satisfies MoonshotAILanguageModelOptions,
        },
      });

      expect(result.content).toEqual([{ type: 'text', text: 'OK!' }]);
      expect(result.providerMetadata?.moonshotai.logprobs)
        .toMatchInlineSnapshot(`
          {
            "content": [
              {
                "bytes": [
                  79,
                  75,
                ],
                "logprob": -0.0004808938247151673,
                "token": "OK",
                "top_logprobs": [
                  {
                    "bytes": [
                      79,
                      75,
                    ],
                    "logprob": -0.0004808938247151673,
                    "token": "OK",
                  },
                ],
              },
              {
                "bytes": null,
                "logprob": -0.01,
                "token": "!",
                "top_logprobs": [
                  {
                    "bytes": null,
                    "logprob": -0.01,
                    "token": "!",
                  },
                ],
              },
            ],
          }
        `);
    });

    it('should parse a null logprobs response', async () => {
      const response = JSON.parse(
        fs.readFileSync('src/__fixtures__/moonshotai-text.json', 'utf8'),
      );
      response.choices[0].logprobs = null;
      server.urls['https://api.moonshot.ai/v1/chat/completions'].response = {
        type: 'json-value',
        body: response,
      };

      const result = await provider.chatModel('moonshot-v1-8k').doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(result.providerMetadata).toEqual({
        moonshotai: {
          responseObject: 'chat.completion',
          choiceIndex: 0,
          messageRole: 'assistant',
        },
      });
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

    it('should preserve the moonshot error envelope', async () => {
      const data = readJsonFixture('moonshotai-error');

      server.urls['https://api.moonshot.ai/v1/chat/completions'].response = {
        type: 'error',
        status: 400,
        body: JSON.stringify(data),
      };

      const error = await Promise.resolve(
        provider.chatModel('kimi-k3').doGenerate({ prompt: TEST_PROMPT }),
      ).catch((error: unknown) => error);

      expect(APICallError.isInstance(error)).toBe(true);
      if (!APICallError.isInstance(error)) {
        expect.fail('Expected an APICallError');
      }
      expect(error.message).toBe(data.error.message);
      expect(error.data).toStrictEqual(data);
    });

    it.each([
      {
        name: 'nullable code',
        data: {
          error: {
            message: 'Invalid request with nullable code',
            type: 'invalid_request_error',
            code: null,
          },
        },
      },
      {
        name: 'message-only error',
        data: {
          error: {
            message: 'Invalid request',
          },
        },
      },
    ])('should preserve a $name envelope', async ({ data }) => {
      server.urls['https://api.moonshot.ai/v1/chat/completions'].response = {
        type: 'error',
        status: 400,
        body: JSON.stringify(data),
      };

      const error = await Promise.resolve(
        provider.chatModel('kimi-k3').doGenerate({ prompt: TEST_PROMPT }),
      ).catch((error: unknown) => error);

      expect(APICallError.isInstance(error)).toBe(true);
      if (!APICallError.isInstance(error)) {
        expect.fail('Expected an APICallError');
      }
      expect(error.message).toBe(data.error.message);
      expect(error.data).toStrictEqual(data);
    });
  });
});

describe('doStream', () => {
  it('should preserve a provider error envelope in stream errors', async () => {
    const data = {
      error: {
        message: 'Internal server error',
        type: 'server_error',
        code: 'upstream_failure',
      },
    };

    const chunks = await getStreamParts('moonshotai-error');
    const errorPart = chunks.find(chunk => chunk.type === 'error');

    expect(errorPart?.type).toBe('error');
    if (errorPart?.type !== 'error') {
      expect.fail('Expected an error part');
    }

    expect(isProviderStreamError(errorPart.error)).toBe(true);
    expect(errorPart.error).toMatchObject({
      message: 'Internal server error',
      type: 'server_error',
      code: 'upstream_failure',
      statusCode: 500,
      isRetryable: true,
      data,
    });
  });

  it('should stream reasoning and text deltas with usage', async () => {
    const parts = await getStreamParts('moonshotai-stream');

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

  it.each(['choice-level finish chunk', 'separate top-level usage chunk'])(
    'should preserve extra fields in streamed raw usage from a %s',
    async usageLocation => {
      const usage = {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
        cached_tokens: 20,
        provider_usage_id: 'usage-123',
        prompt_tokens_details: {
          cached_tokens: 20,
          cache_type: 'ephemeral',
        },
        completion_tokens_details: {
          reasoning_tokens: 10,
          billable_tokens: 42,
        },
      };
      const finishChunk = {
        id: 'chatcmpl-raw-usage',
        object: 'chat.completion.chunk',
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: 'stop',
            ...(usageLocation === 'choice-level finish chunk' && { usage }),
          },
        ],
      };
      const chunks: Array<Record<string, unknown>> = [finishChunk];

      if (usageLocation === 'separate top-level usage chunk') {
        chunks.push({
          id: 'chatcmpl-raw-usage',
          object: 'chat.completion.chunk',
          choices: [],
          usage,
        });
      }

      server.urls['https://api.moonshot.ai/v1/chat/completions'].response = {
        type: 'stream-chunks',
        chunks: [
          ...chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`),
          'data: [DONE]\n\n',
        ],
      };

      const result = await provider.chatModel('kimi-k3').doStream({
        prompt: TEST_PROMPT,
      });
      const parts = await convertReadableStreamToArray(result.stream);

      expect(parts.at(-1)).toMatchObject({
        type: 'finish',
        usage: {
          inputTokens: { total: 100, noCache: 80, cacheRead: 20 },
          outputTokens: { total: 50, text: 40, reasoning: 10 },
          raw: usage,
        },
      });
    },
  );

  it('should include stream options with usage', async () => {
    prepareChunksFixtureResponse('moonshotai-stream');

    await provider.chatModel('kimi-k3').doStream({ prompt: TEST_PROMPT });

    const requestBody = await server.calls[0].requestBodyJson;
    expect(requestBody.stream).toBe(true);
    expect(requestBody.stream_options).toStrictEqual({
      include_usage: true,
    });
  });

  it('should send dynamic tool messages when streaming', async () => {
    prepareChunksFixtureResponse('moonshotai-stream');

    await provider.chatModel('kimi-k3').doStream({
      prompt: [
        {
          role: 'system',
          content: '',
          providerOptions: {
            moonshotai: {
              tools: [
                {
                  type: 'function',
                  name: 'calculator',
                  inputSchema: { type: 'object', properties: {} },
                },
              ],
            },
          },
        },
      ],
    });

    expect((await server.calls[0].requestBodyJson).messages[0]).toMatchObject({
      role: 'system',
      tools: [{ function: { name: 'calculator' } }],
    });
  });

  it('should send partial true on the final assistant message', async () => {
    prepareChunksFixtureResponse('moonshotai-stream');

    await provider.chatModel('kimi-k3').doStream({
      prompt: [
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'The answer is' }],
          providerOptions: {
            moonshotai: {
              partial: true,
            } satisfies MoonshotAIAssistantMessageProviderOptions,
          },
        },
      ],
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      messages: [
        {
          role: 'assistant',
          content: 'The answer is',
          partial: true,
        },
      ],
      stream: true,
    });
  });

  it('should send message names', async () => {
    prepareChunksFixtureResponse('moonshotai-stream');

    await provider.chatModel('kimi-k3').doStream({
      prompt: [
        {
          role: 'system',
          content: 'You are a helpful assistant.',
          providerOptions: {
            moonshotai: {
              name: 'guide',
            } satisfies MoonshotAIMessageProviderOptions,
          },
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }],
          providerOptions: {
            moonshotai: {
              name: 'alice',
            } satisfies MoonshotAIMessageProviderOptions,
          },
        },
      ],
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant.',
          name: 'guide',
        },
        { role: 'user', content: 'Hello', name: 'alice' },
      ],
      stream: true,
    });
  });

  it('should include tool-message name warnings in the stream start', async () => {
    prepareChunksFixtureResponse('moonshotai-stream');

    const result = await provider.chatModel('kimi-k3').doStream({
      prompt: [
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call-1',
              toolName: 'weather',
              output: { type: 'text', value: 'sunny' },
            },
          ],
          providerOptions: {
            moonshotai: {
              name: 'weather_tool',
            } satisfies MoonshotAIMessageProviderOptions,
          },
        },
      ],
    });

    const parts = await convertReadableStreamToArray(result.stream);
    expect(parts[0]).toEqual({
      type: 'stream-start',
      warnings: [
        {
          type: 'unsupported',
          feature: 'message name on tool messages',
        },
      ],
    });
  });

  it('should assemble tool calls without explicit indices', async () => {
    const parts = await getStreamParts(
      'moonshotai-stream-indexless-tool-calls',
    );

    expect(parts.some(part => part.type === 'error')).toBe(false);
    expect(
      parts
        .filter(part => part.type === 'tool-call')
        .map(({ toolCallId, toolName, input }) => ({
          toolCallId,
          toolName,
          input,
        })),
    ).toEqual([
      {
        toolCallId: 'weather_0',
        toolName: 'weather',
        input: '{"location":"San Francisco"}',
      },
      {
        toolCallId: 'time_1',
        toolName: 'time',
        input: '{"zone":"UTC"}',
      },
    ]);
  });

  it('should preserve explicit tool call indices', async () => {
    const parts = await getStreamParts(
      'moonshotai-stream-explicit-tool-call-index',
    );

    expect(parts.some(part => part.type === 'error')).toBe(false);
    expect(
      parts
        .filter(part => part.type === 'tool-call')
        .map(({ toolCallId, toolName, input }) => ({
          toolCallId,
          toolName,
          input,
        })),
    ).toEqual([
      {
        toolCallId: 'weather_0',
        toolName: 'weather',
        input: '{"location": "San Francisco"}',
      },
    ]);
  });

  it('should use choice-level usage when top-level usage is absent', async () => {
    const parts = await getStreamParts('moonshotai-stream-choice-usage');

    expect(parts.at(-1)).toMatchObject({
      type: 'finish',
      usage: {
        inputTokens: { total: 12 },
        outputTokens: { total: 5, reasoning: 1 },
      },
    });
  });

  it('should prefer top-level usage over choice-level usage', async () => {
    const parts = await getStreamParts('moonshotai-stream-usage-precedence');

    expect(parts.at(-1)).toMatchObject({
      type: 'finish',
      usage: {
        inputTokens: { total: 99 },
        outputTokens: { total: 33 },
      },
    });
  });

  it('should reject malformed tool call indices', async () => {
    const parts = await getStreamParts(
      'moonshotai-stream-malformed-tool-call-index',
    );

    expect(parts.some(part => part.type === 'error')).toBe(true);
  });

  it('should collect streamed logprobs in finish provider metadata', async () => {
    prepareChunksFixtureResponse('moonshotai-logprobs');

    const result = await provider.chatModel('moonshot-v1-8k').doStream({
      prompt: TEST_PROMPT,
      providerOptions: {
        moonshotai: {
          topLogprobs: 1,
        } satisfies MoonshotAILanguageModelOptions,
      },
    });

    const parts = await convertReadableStreamToArray(result.stream);

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      logprobs: true,
      top_logprobs: 1,
    });
    expect(
      parts
        .filter(part => part.type === 'text-delta')
        .map(part => part.delta)
        .join(''),
    ).toBe('OK!');
    expect(parts.find(part => part.type === 'finish')?.providerMetadata)
      .toMatchInlineSnapshot(`
        {
          "moonshotai": {
            "choiceIndex": 0,
            "logprobs": {
              "content": [
                {
                  "bytes": [
                    79,
                    75,
                  ],
                  "logprob": -0.0004457433824427426,
                  "token": "OK",
                  "top_logprobs": [
                    {
                      "bytes": [
                        79,
                        75,
                      ],
                      "logprob": -0.0004457433824427426,
                      "token": "OK",
                    },
                  ],
                },
                {
                  "bytes": null,
                  "logprob": -0.01,
                  "token": "!",
                  "top_logprobs": [
                    {
                      "bytes": null,
                      "logprob": -0.01,
                      "token": "!",
                    },
                  ],
                },
              ],
            },
            "messageRole": "assistant",
            "responseObject": "chat.completion.chunk",
          },
        }
      `);
  });

  it('should forward text-part-array predicted content unchanged', async () => {
    prepareChunksFixtureResponse('moonshotai-stream');

    await provider.chatModel('kimi-k3').doStream({
      prompt: TEST_PROMPT,
      providerOptions: {
        moonshotai: {
          prediction: {
            type: 'content',
            content: [
              { type: 'text', text: 'Hello' },
              { type: 'text', text: ', world!' },
            ],
          },
        },
      },
    });

    const requestBody = await server.calls[0].requestBodyJson;
    expect(requestBody.prediction).toStrictEqual({
      type: 'content',
      content: [
        { type: 'text', text: 'Hello' },
        { type: 'text', text: ', world!' },
      ],
    });
  });

  it('should send maxOutputTokens as max_completion_tokens', async () => {
    prepareChunksFixtureResponse('moonshotai-stream');

    await provider.chatModel('kimi-k3').doStream({
      prompt: TEST_PROMPT,
      maxOutputTokens: 17,
    });

    const requestBody = await server.calls[0].requestBodyJson;
    expect(requestBody.max_completion_tokens).toBe(17);
    expect(requestBody).not.toHaveProperty('max_tokens');
  });

  it('should omit max_completion_tokens when maxOutputTokens is undefined', async () => {
    prepareChunksFixtureResponse('moonshotai-stream');

    await provider.chatModel('kimi-k3').doStream({
      prompt: TEST_PROMPT,
    });

    const requestBody = await server.calls[0].requestBodyJson;
    expect(requestBody).not.toHaveProperty('max_completion_tokens');
    expect(requestBody).not.toHaveProperty('max_tokens');
  });
  it('should preserve response metadata and raw tool-call chunks', async () => {
    prepareChunksFixtureResponse('moonshotai-tool-call');

    const result = await provider.chatModel('kimi-k3').doStream({
      prompt: TEST_PROMPT,
      includeRawChunks: true,
    });

    const parts = await convertReadableStreamToArray(result.stream);
    const rawChunks = fs
      .readFileSync('src/__fixtures__/moonshotai-tool-call.chunks.txt', 'utf8')
      .split('\n')
      .filter(line => line.length > 0)
      .map(line => JSON.parse(line));

    expect(
      parts.filter(part => part.type === 'raw').map(part => part.rawValue),
    ).toEqual(rawChunks);
    expect(parts).toContainEqual({
      type: 'tool-call',
      toolCallId: 'call_abc123',
      toolName: 'get_weather',
      input: '{"city":"Paris"}',
    });
    expect(
      parts.find(part => part.type === 'finish')?.providerMetadata,
    ).toEqual({
      moonshotai: {
        responseObject: 'chat.completion.chunk',
        choiceIndex: 0,
        messageRole: 'assistant',
        toolCallTypes: ['function'],
      },
    });
  });

  it.each([null, undefined])(
    'should tolerate %s streamed response metadata fields',
    async metadataValue => {
      const responseBody = {
        id: 'chatcmpl-stream',
        object: metadataValue,
        choices: [
          {
            index: metadataValue,
            delta: { role: metadataValue, content: 'Hello' },
            finish_reason: 'stop',
          },
        ],
      };

      if (metadataValue === undefined) {
        delete responseBody.object;
        delete responseBody.choices[0].index;
        delete responseBody.choices[0].delta.role;
      }

      server.urls['https://api.moonshot.ai/v1/chat/completions'].response = {
        type: 'stream-chunks',
        chunks: [
          `data: ${JSON.stringify(responseBody)}\n\n`,
          'data: [DONE]\n\n',
        ],
      };

      const result = await provider.chatModel('kimi-k3').doStream({
        prompt: TEST_PROMPT,
      });
      const parts = await convertReadableStreamToArray(result.stream);

      expect(
        parts.find(part => part.type === 'finish')?.providerMetadata,
      ).toEqual({ moonshotai: {} });
    },
  );
});
