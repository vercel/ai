import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
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

    it('should send maxOutputTokens as max_completion_tokens', async () => {
      await provider.chatModel('kimi-k3').doGenerate({
        prompt: TEST_PROMPT,
        maxOutputTokens: 512,
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.max_completion_tokens).toBe(512);
      expect(requestBody).not.toHaveProperty('max_tokens');
    });

    it('should omit token limit fields when maxOutputTokens is undefined', async () => {
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

    it.each([
      { modelId: 'kimi-k2.6', modelFamily: 'kimi-k2.6' },
      { modelId: 'kimi-k2.7-code', modelFamily: 'kimi-k2.7' },
      { modelId: 'kimi-k2.7-code-highspeed', modelFamily: 'kimi-k2.7' },
    ] as const)(
      'should omit required tool choice and warn for $modelId',
      async ({ modelId, modelFamily }) => {
        const result = await provider.chatModel(modelId).doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'function',
              name: 'getWeather',
              description: 'Get the weather in a location',
              inputSchema: {
                type: 'object',
                properties: { location: { type: 'string' } },
                required: ['location'],
              },
            },
          ],
          toolChoice: { type: 'required' },
        });

        const requestBody = await server.calls[0].requestBodyJson;
        expect(requestBody).not.toHaveProperty('tool_choice');
        expect(requestBody.tools).toHaveLength(1);
        expect(result.warnings).toStrictEqual([
          {
            type: 'unsupported',
            feature: 'toolChoice',
            details: `Required tool choice is not supported by ${modelFamily} models and has been omitted.`,
          },
        ]);
      },
    );

    it.each(['kimi-k3', 'custom-model'] as const)(
      'should preserve required tool choice for %s',
      async modelId => {
        const result = await provider.chatModel(modelId).doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'function',
              name: 'getWeather',
              description: 'Get the weather in a location',
              inputSchema: {
                type: 'object',
                properties: { location: { type: 'string' } },
                required: ['location'],
              },
            },
          ],
          toolChoice: { type: 'required' },
        });

        expect(await server.calls[0].requestBodyJson).toMatchObject({
          model: modelId,
          tool_choice: 'required',
        });
        expect(result.warnings).toStrictEqual([]);
      },
    );

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
      expect(result.providerMetadata).toEqual({
        moonshotai: {
          responseObject: 'chat.completion',
          choiceIndex: 0,
          messageRole: 'assistant',
        },
      });
    });

    it('should safely omit null response metadata fields', async () => {
      server.urls['https://api.moonshot.ai/v1/chat/completions'].response = {
        type: 'json-value',
        body: {
          id: 'chatcmpl-null-metadata',
          object: null,
          created: 1785880000,
          model: 'kimi-k3',
          choices: [
            {
              index: null,
              message: { role: null, content: 'Hello' },
              finish_reason: 'stop',
            },
          ],
          usage: null,
        },
      };

      const result = await provider.chatModel('kimi-k3').doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(result.content).toEqual([{ type: 'text', text: 'Hello' }]);
      expect(result.providerMetadata).toEqual({ moonshotai: {} });
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

    it('should send provider references and text file parts', async () => {
      await provider.chatModel('kimi-k3').doGenerate({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                data: {
                  type: 'reference' as const,
                  reference: { moonshotai: 'file-video-123' },
                },
                mediaType: 'video/mp4',
              },
              {
                type: 'file',
                data: { type: 'text' as const, text: 'Transcript text' },
                mediaType: 'text/plain',
              },
            ],
          },
        ],
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.messages[0].content).toEqual([
        {
          type: 'video_url',
          video_url: { url: 'ms://file-video-123' },
        },
        { type: 'text', text: 'Transcript text' },
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

    it('should normalize json schemas and enable strict mode by default', async () => {
      await provider.chatModel('kimi-k3').doGenerate({
        prompt: TEST_PROMPT,
        responseFormat: {
          type: 'json',
          name: 'recipe',
          description: 'A recipe',
          schema: {
            $schema: 'http://json-schema.org/draft-07/schema#',
            type: 'object',
            properties: {
              name: { type: 'string' },
              coordinates: {
                type: 'array',
                items: [{ type: 'number' }, { type: 'number' }],
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
              name: { type: 'string' },
              coordinates: {
                type: 'array',
                prefixItems: [{ type: 'number' }, { type: 'number' }],
              },
            },
          },
        },
      });
    });

    it('should allow strict json schema validation to be disabled', async () => {
      await provider.chatModel('kimi-k3').doGenerate({
        prompt: TEST_PROMPT,
        responseFormat: {
          type: 'json',
          schema: { type: 'object', properties: {} },
        },
        providerOptions: {
          moonshotai: { strictJsonSchema: false },
        },
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.response_format).toStrictEqual({
        type: 'json_schema',
        json_schema: {
          name: 'response',
          strict: false,
          schema: { type: 'object', properties: {} },
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
      'moonshot-v1-auto',
      'moonshot-v1-8k',
      'moonshot-v1-32k',
      'moonshot-v1-128k',
      'moonshot-v1-8k-vision-preview',
      'moonshot-v1-32k-vision-preview',
      'moonshot-v1-128k-vision-preview',
    ])('should use json_schema for %s', async modelId => {
      await provider.chatModel(modelId).doGenerate({
        prompt: TEST_PROMPT,
        responseFormat: {
          type: 'json',
          schema: { type: 'object', properties: {} },
        },
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.response_format).toStrictEqual({
        type: 'json_schema',
        json_schema: {
          name: 'response',
          strict: true,
          schema: { type: 'object', properties: {} },
        },
      });
    });

    it('should fall back to json_object for unknown models', async () => {
      await provider.chatModel('moonshot-v1-custom').doGenerate({
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

    it.each([
      ['a string', 'The expected response.'],
      [
        'text content parts',
        [
          { type: 'text', text: 'The expected ' },
          { type: 'text', text: 'response.' },
        ],
      ],
    ])('should forward predicted output with %s', async (_name, content) => {
      await provider.chatModel('kimi-k3').doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: {
          moonshotai: {
            prediction: { type: 'content', content },
          },
        },
      });

      expect((await server.calls[0].requestBodyJson).prediction).toEqual({
        type: 'content',
        content,
      });
    });

    it('should not send prediction by default', async () => {
      await provider.chatModel('kimi-k3').doGenerate({ prompt: TEST_PROMPT });

      expect(await server.calls[0].requestBodyJson).not.toHaveProperty(
        'prediction',
      );
    });

    it.each([
      { type: 'unsupported', content: 'text' },
      { type: 'content', content: [{ type: 'image', image_url: 'x' }] },
      { type: 'content', content: 42 },
    ])('should reject invalid predicted output %#', async prediction => {
      await expect(
        provider.chatModel('kimi-k3').doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            moonshotai: { prediction },
          },
        }),
      ).rejects.toThrow('invalid moonshotai provider options');
    });

    it('should send participant names on supported message roles', async () => {
      await provider.chatModel('kimi-k3').doGenerate({
        prompt: [
          {
            role: 'system',
            content: 'You are Kimi.',
            providerOptions: { moonshotai: { name: 'guide' } },
          },
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
            providerOptions: { moonshotai: { name: 'alice' } },
          },
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'Hi' }],
            providerOptions: { moonshotai: { name: 'helper' } },
          },
        ],
      });

      expect((await server.calls[0].requestBodyJson).messages).toEqual([
        { role: 'system', content: 'You are Kimi.', name: 'guide' },
        { role: 'user', content: 'Hello', name: 'alice' },
        {
          role: 'assistant',
          content: 'Hi',
          name: 'helper',
        },
      ]);
    });
  });

  describe('Partial Mode', () => {
    beforeEach(() => {
      prepareJsonFixtureResponse('moonshotai-text');
    });

    it('should send partial true on the final assistant message', async () => {
      await provider.chatModel('kimi-k3').doGenerate({
        prompt: [
          { role: 'user', content: [{ type: 'text', text: 'Return JSON.' }] },
          {
            role: 'assistant',
            content: [{ type: 'text', text: '{' }],
            providerOptions: { moonshotai: { partial: true } },
          },
        ],
      });

      expect((await server.calls[0].requestBodyJson).messages.at(-1)).toEqual({
        role: 'assistant',
        content: '{',
        partial: true,
      });
    });

    it('should reject partial with structured outputs before the request', async () => {
      await expect(
        provider.chatModel('kimi-k3').doGenerate({
          prompt: [
            {
              role: 'assistant',
              content: [{ type: 'text', text: '{' }],
              providerOptions: { moonshotai: { partial: true } },
            },
          ],
          responseFormat: {
            type: 'json',
            schema: { type: 'object', properties: {} },
          },
        }),
      ).rejects.toThrow(
        'Moonshot Partial Mode cannot be combined with a JSON response format.',
      );
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
                dynamicTools: [
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

    it('should reject dynamic tools for non-K3 official models', async () => {
      await expect(
        provider.chatModel('kimi-k2.6').doGenerate({
          prompt: [
            {
              role: 'system',
              content: '',
              providerOptions: {
                moonshotai: { dynamicTools: [] },
              },
            },
          ],
        }),
      ).rejects.toThrow(
        'Moonshot dynamic tool loading is only supported by Kimi K3',
      );
    });
  });

  describe('logprobs', () => {
    beforeEach(() => {
      prepareJsonFixtureResponse('moonshotai-logprobs');
    });

    it('should send logprobs provider options', async () => {
      const result = await provider.chatModel('moonshot-v1-8k').doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: {
          moonshotai: { logprobs: true, topLogprobs: 1 },
        },
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        logprobs: true,
        top_logprobs: 1,
      });
      expect(result.content).toEqual([{ type: 'text', text: 'Hello' }]);
      expect(result.providerMetadata?.moonshotai.logprobs).toEqual({
        content: [
          {
            token: 'Hello',
            logprob: -0.01,
            bytes: [72, 101, 108, 108, 111],
            top_logprobs: [
              {
                token: 'Hello',
                logprob: -0.01,
                bytes: [72, 101, 108, 108, 111],
              },
            ],
          },
        ],
        refusal: null,
      });
    });

    it('should enable logprobs when topLogprobs is set', async () => {
      await provider.chatModel('moonshot-v1-8k').doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: { moonshotai: { topLogprobs: 20 } },
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        logprobs: true,
        top_logprobs: 20,
      });
    });

    it.each([-1, 21, 1.5])(
      'should reject invalid topLogprobs value %s',
      async topLogprobs => {
        await expect(
          provider.chatModel('moonshot-v1-8k').doGenerate({
            prompt: TEST_PROMPT,
            providerOptions: { moonshotai: { topLogprobs } },
          }),
        ).rejects.toThrow();
      },
    );
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
      providerMetadata: {
        moonshotai: {
          responseObject: 'chat.completion.chunk',
          choiceIndex: 0,
          messageRole: 'assistant',
        },
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

  it('should send maxOutputTokens as max_completion_tokens when streaming', async () => {
    prepareChunksFixtureResponse('moonshotai-stream');

    await provider.chatModel('kimi-k3').doStream({
      prompt: TEST_PROMPT,
      maxOutputTokens: 256,
    });

    const requestBody = await server.calls[0].requestBodyJson;
    expect(requestBody.max_completion_tokens).toBe(256);
    expect(requestBody).not.toHaveProperty('max_tokens');
  });

  it('should assemble index-less tool calls and use choice-level usage', async () => {
    prepareChunksFixtureResponse('moonshotai-stream-tool-calls');

    const result = await provider.chatModel('kimi-k3').doStream({
      prompt: TEST_PROMPT,
    });

    const parts = await convertReadableStreamToArray(result.stream);

    expect(parts).toContainEqual({
      type: 'tool-call',
      toolCallId: 'call-weather',
      toolName: 'get_weather',
      input: '{"city":"Paris"}',
    });
    expect(parts).toContainEqual({
      type: 'tool-call',
      toolCallId: 'call-time',
      toolName: 'get_time',
      input: '{"zone":"UTC"}',
    });
    expect(parts.at(-1)).toMatchObject({
      type: 'finish',
      finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
      usage: {
        inputTokens: { total: 11 },
        outputTokens: { total: 6 },
      },
      providerMetadata: {
        moonshotai: {
          responseObject: 'chat.completion.chunk',
          choiceIndex: 0,
          messageRole: 'assistant',
          toolCallTypes: ['function', 'function'],
        },
      },
    });
  });

  it('should surface malformed tool-call chunks as validation errors', async () => {
    prepareChunksFixtureResponse('moonshotai-stream-malformed-tool-call');

    const result = await provider.chatModel('kimi-k3').doStream({
      prompt: TEST_PROMPT,
    });

    const parts = await convertReadableStreamToArray(result.stream);

    expect(parts.filter(part => part.type === 'error')).toHaveLength(1);
    expect(parts.at(-1)).toMatchObject({
      type: 'finish',
      finishReason: { unified: 'error' },
    });
  });

  it('should collect streamed logprobs without changing text output', async () => {
    prepareChunksFixtureResponse('moonshotai-logprobs');

    const result = await provider.chatModel('moonshot-v1-8k').doStream({
      prompt: TEST_PROMPT,
      providerOptions: {
        moonshotai: { topLogprobs: 1 },
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
    ).toBe('Hello');
    expect(parts.at(-1)).toMatchObject({
      type: 'finish',
      providerMetadata: {
        moonshotai: {
          logprobs: {
            content: [
              {
                token: 'Hel',
                logprob: -0.02,
                bytes: [72, 101, 108],
              },
              { token: 'lo', logprob: -0.03, bytes: null },
            ],
          },
        },
      },
    });
  });
});
