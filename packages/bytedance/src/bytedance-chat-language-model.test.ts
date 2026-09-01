import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { createByteDance } from './bytedance-provider';
import type {
  ByteDanceChatModelId,
  ByteDanceLanguageModelChatOptions,
} from './index';

const TEST_PROMPT: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const server = createTestServer({
  'https://ark.cn-beijing.volces.com/api/v3/chat/completions': {},
});

const defaultModel = createByteDance({
  apiKey: 'test-api-key',
  baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
})('doubao-seed-2-1-pro-260628');

describe('ByteDanceChatLanguageModel', () => {
  describe('doGenerate', () => {
    it('should generate basic text completion', async () => {
      server.urls[
        'https://ark.cn-beijing.volces.com/api/v3/chat/completions'
      ].response = {
        type: 'json-value',
        body: {
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1694268190,
          model: 'doubao-seed-2-1-pro-260628',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'Hello, how can I help you today?',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 8,
            total_tokens: 18,
            prompt_tokens_details: {
              cached_tokens: 4,
            },
          },
        },
      };

      const result = await defaultModel.doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(result.content).toEqual([
        { type: 'text', text: 'Hello, how can I help you today?' },
      ]);
      expect(result.finishReason).toEqual({
        unified: 'stop',
        raw: 'stop',
      });
      expect(result.usage).toEqual({
        inputTokens: {
          total: 10,
          noCache: 6,
          cacheRead: 4,
          cacheWrite: undefined,
        },
        outputTokens: {
          total: 8,
          text: 8,
          reasoning: 0,
        },
        raw: {
          prompt_tokens: 10,
          completion_tokens: 8,
          total_tokens: 18,
          prompt_tokens_details: {
            cached_tokens: 4,
          },
        },
      });
    });

    it('should extract reasoning content when returned by model', async () => {
      server.urls[
        'https://ark.cn-beijing.volces.com/api/v3/chat/completions'
      ].response = {
        type: 'json-value',
        body: {
          id: 'chatcmpl-456',
          object: 'chat.completion',
          created: 1694268190,
          model: 'doubao-seed-2-1-pro-260628',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: '42 is the answer.',
                reasoning_content:
                  'Let me think step by step about the ultimate question.',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 15,
            completion_tokens: 20,
            total_tokens: 35,
            completion_tokens_details: {
              reasoning_tokens: 12,
            },
          },
        },
      };

      const result = await defaultModel.doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(result.content).toEqual([
        { type: 'text', text: '42 is the answer.' },
        {
          type: 'reasoning',
          text: 'Let me think step by step about the ultimate question.',
        },
      ]);
      expect(result.usage.outputTokens).toEqual({
        total: 20,
        text: 8,
        reasoning: 12,
      });
    });

    it('should handle tool calls in generation', async () => {
      server.urls[
        'https://ark.cn-beijing.volces.com/api/v3/chat/completions'
      ].response = {
        type: 'json-value',
        body: {
          id: 'chatcmpl-789',
          object: 'chat.completion',
          created: 1694268190,
          model: 'doubao-seed-2-1-pro-260628',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'call_abc123',
                    type: 'function',
                    function: {
                      name: 'getWeather',
                      arguments: '{"location":"Beijing"}',
                    },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
          usage: {
            prompt_tokens: 25,
            completion_tokens: 12,
            total_tokens: 37,
          },
        },
      };

      const result = await defaultModel.doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(result.content).toEqual([
        {
          type: 'tool-call',
          toolCallId: 'call_abc123',
          toolName: 'getWeather',
          input: '{"location":"Beijing"}',
        },
      ]);
      expect(result.finishReason).toEqual({
        unified: 'tool-calls',
        raw: 'tool_calls',
      });
    });

    it('should map ByteDance provider options to request fields', async () => {
      server.urls[
        'https://ark.cn-beijing.volces.com/api/v3/chat/completions'
      ].response = {
        type: 'json-value',
        body: {
          id: 'chatcmpl-opts',
          object: 'chat.completion',
          created: 1694268190,
          model: 'doubao-seed-2-1-pro-260628',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'Response with options',
              },
              finish_reason: 'stop',
            },
          ],
        },
      };

      const providerOptions: ByteDanceLanguageModelChatOptions = {
        user: 'user-456',
        parallelToolCalls: false,
        logprobs: true,
        topLogprobs: 3,
        logitBias: { '1234': 2 },
        reasoningEffort: 'high',
        thinking: { type: 'enabled' },
      };

      await defaultModel.doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: { bytedance: providerOptions },
      });

      const requestBody = await server.calls[0].requestBodyJson;

      expect(requestBody).toMatchObject({
        user: 'user-456',
        parallel_tool_calls: false,
        logprobs: true,
        top_logprobs: 3,
        logit_bias: { '1234': 2 },
        reasoning_effort: 'high',
        thinking: { type: 'enabled' },
      });
      expect(requestBody).not.toHaveProperty('parallelToolCalls');
      expect(requestBody).not.toHaveProperty('topLogprobs');
      expect(requestBody).not.toHaveProperty('logitBias');
    });

    it('should map reasoning effort when passed via reasoning call option', async () => {
      server.urls[
        'https://ark.cn-beijing.volces.com/api/v3/chat/completions'
      ].response = {
        type: 'json-value',
        body: {
          id: 'chatcmpl-reasoning',
          object: 'chat.completion',
          created: 1694268190,
          model: 'doubao-seed-2-1-pro-260628',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'Reasoned output',
              },
              finish_reason: 'stop',
            },
          ],
        },
      };

      await defaultModel.doGenerate({
        prompt: TEST_PROMPT,
        reasoning: 'high',
      });

      const requestBody = await server.calls[0].requestBodyJson;

      expect(requestBody).toMatchObject({
        reasoning_effort: 'high',
      });
    });

    it('should throw APICallError on error response', async () => {
      server.urls[
        'https://ark.cn-beijing.volces.com/api/v3/chat/completions'
      ].response = {
        type: 'error',
        status: 400,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          error: {
            message: 'Invalid model ID or endpoint not found',
            type: 'invalid_request_error',
            code: 'InvalidEndpointOrModel.NotFound',
          },
        }),
      };

      await expect(
        defaultModel.doGenerate({
          prompt: TEST_PROMPT,
        }),
      ).rejects.toThrow('Invalid model ID or endpoint not found');
    });
  });

  describe('doStream', () => {
    it('should stream text chunks and finish with usage', async () => {
      server.urls[
        'https://ark.cn-beijing.volces.com/api/v3/chat/completions'
      ].response = {
        type: 'stream-chunks',
        chunks: [
          'data: {"id":"chatcmpl-stream","object":"chat.completion.chunk","created":1694268190,"model":"doubao-seed-2-1-pro-260628","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}\n\n',
          'data: {"id":"chatcmpl-stream","object":"chat.completion.chunk","created":1694268190,"model":"doubao-seed-2-1-pro-260628","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}\n\n',
          'data: {"id":"chatcmpl-stream","object":"chat.completion.chunk","created":1694268190,"model":"doubao-seed-2-1-pro-260628","choices":[{"index":0,"delta":{"content":" world!"},"finish_reason":null}]}\n\n',
          'data: {"id":"chatcmpl-stream","object":"chat.completion.chunk","created":1694268190,"model":"doubao-seed-2-1-pro-260628","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
          'data: {"id":"chatcmpl-stream","object":"chat.completion.chunk","created":1694268190,"model":"doubao-seed-2-1-pro-260628","choices":[],"usage":{"prompt_tokens":5,"completion_tokens":3,"total_tokens":8}}\n\n',
          'data: [DONE]\n\n',
        ],
      };

      const { stream } = await defaultModel.doStream({
        prompt: TEST_PROMPT,
      });

      const chunks = await convertReadableStreamToArray(stream);

      expect(chunks).toEqual([
        { type: 'stream-start', warnings: [] },
        {
          type: 'response-metadata',
          id: 'chatcmpl-stream',
          modelId: 'doubao-seed-2-1-pro-260628',
          timestamp: expect.any(Date),
        },
        { type: 'text-start', id: 'txt-0' },
        { type: 'text-delta', delta: 'Hello', id: 'txt-0' },
        { type: 'text-delta', delta: ' world!', id: 'txt-0' },
        { type: 'text-end', id: 'txt-0' },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: {
            inputTokens: {
              total: 5,
              noCache: 5,
              cacheRead: 0,
              cacheWrite: undefined,
            },
            outputTokens: { total: 3, text: 3, reasoning: 0 },
            raw: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
          },
          providerMetadata: { bytedance: {} },
        },
      ]);
    });

    it('should stream reasoning deltas', async () => {
      server.urls[
        'https://ark.cn-beijing.volces.com/api/v3/chat/completions'
      ].response = {
        type: 'stream-chunks',
        chunks: [
          'data: {"id":"chatcmpl-stream-reasoning","object":"chat.completion.chunk","created":1694268190,"model":"doubao-seed-2-1-pro-260628","choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":"Thinking..."},"finish_reason":null}]}\n\n',
          'data: {"id":"chatcmpl-stream-reasoning","object":"chat.completion.chunk","created":1694268190,"model":"doubao-seed-2-1-pro-260628","choices":[{"index":0,"delta":{"content":"Answer"},"finish_reason":null}]}\n\n',
          'data: {"id":"chatcmpl-stream-reasoning","object":"chat.completion.chunk","created":1694268190,"model":"doubao-seed-2-1-pro-260628","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
          'data: [DONE]\n\n',
        ],
      };

      const { stream } = await defaultModel.doStream({
        prompt: TEST_PROMPT,
      });

      const chunks = await convertReadableStreamToArray(stream);

      expect(chunks).toEqual([
        { type: 'stream-start', warnings: [] },
        {
          type: 'response-metadata',
          id: 'chatcmpl-stream-reasoning',
          modelId: 'doubao-seed-2-1-pro-260628',
          timestamp: expect.any(Date),
        },
        { type: 'reasoning-start', id: 'reasoning-0' },
        {
          type: 'reasoning-delta',
          delta: 'Thinking...',
          id: 'reasoning-0',
        },
        { type: 'reasoning-end', id: 'reasoning-0' },
        { type: 'text-start', id: 'txt-0' },
        { type: 'text-delta', delta: 'Answer', id: 'txt-0' },
        { type: 'text-end', id: 'txt-0' },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: {
            inputTokens: {
              total: undefined,
              noCache: undefined,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: {
              total: undefined,
              text: undefined,
              reasoning: undefined,
            },
            raw: undefined,
          },
          providerMetadata: { bytedance: {} },
        },
      ]);
    });

    it('should stream tool calls', async () => {
      server.urls[
        'https://ark.cn-beijing.volces.com/api/v3/chat/completions'
      ].response = {
        type: 'stream-chunks',
        chunks: [
          'data: {"id":"chatcmpl-stream-tool","object":"chat.completion.chunk","created":1694268190,"model":"doubao-seed-2-1-pro-260628","choices":[{"index":0,"delta":{"role":"assistant","tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"search","arguments":""}}]},"finish_reason":null}]}\n\n',
          'data: {"id":"chatcmpl-stream-tool","object":"chat.completion.chunk","created":1694268190,"model":"doubao-seed-2-1-pro-260628","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"query\\":\\"ai\\"}"}}]},"finish_reason":null}]}\n\n',
          'data: {"id":"chatcmpl-stream-tool","object":"chat.completion.chunk","created":1694268190,"model":"doubao-seed-2-1-pro-260628","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}\n\n',
          'data: [DONE]\n\n',
        ],
      };

      const { stream } = await defaultModel.doStream({
        prompt: TEST_PROMPT,
      });

      const chunks = await convertReadableStreamToArray(stream);

      expect(chunks).toEqual([
        { type: 'stream-start', warnings: [] },
        {
          type: 'response-metadata',
          id: 'chatcmpl-stream-tool',
          modelId: 'doubao-seed-2-1-pro-260628',
          timestamp: expect.any(Date),
        },
        { type: 'tool-input-start', id: 'call_1', toolName: 'search' },
        { type: 'tool-input-delta', id: 'call_1', delta: '{"query":"ai"}' },
        { type: 'tool-input-end', id: 'call_1' },
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'search',
          input: '{"query":"ai"}',
        },
        {
          type: 'finish',
          finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
          usage: {
            inputTokens: {
              total: undefined,
              noCache: undefined,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: {
              total: undefined,
              text: undefined,
              reasoning: undefined,
            },
            raw: undefined,
          },
          providerMetadata: { bytedance: {} },
        },
      ]);
    });
  });

  describe('type testing', () => {
    it('exports the constrained ByteDance provider options type', () => {
      expectTypeOf<
        NonNullable<ByteDanceLanguageModelChatOptions['reasoningEffort']>
      >().toEqualTypeOf<'minimal' | 'low' | 'medium' | 'high'>();
      expectTypeOf<
        NonNullable<ByteDanceLanguageModelChatOptions['thinking']>['type']
      >().toEqualTypeOf<'enabled' | 'disabled' | 'auto'>();
    });

    it('exports valid ByteDanceChatModelId types', () => {
      expectTypeOf<'doubao-seed-2-1-pro-260628'>().toMatchTypeOf<ByteDanceChatModelId>();
      expectTypeOf<'doubao-seed-2-1-turbo-260628'>().toMatchTypeOf<ByteDanceChatModelId>();
      expectTypeOf<'doubao-seed-evolving'>().toMatchTypeOf<ByteDanceChatModelId>();
      expectTypeOf<'doubao-seed-2-0-pro-260215'>().toMatchTypeOf<ByteDanceChatModelId>();
      expectTypeOf<'doubao-seed-2-0-lite-260428'>().toMatchTypeOf<ByteDanceChatModelId>();
      expectTypeOf<'doubao-seed-2-0-mini-260428'>().toMatchTypeOf<ByteDanceChatModelId>();
      expectTypeOf<'doubao-seed-2-0-code-preview-260215'>().toMatchTypeOf<ByteDanceChatModelId>();
      expectTypeOf<'doubao-seed-character-260628'>().toMatchTypeOf<ByteDanceChatModelId>();
      expectTypeOf<'deepseek-v4-pro-ga-260813'>().toMatchTypeOf<ByteDanceChatModelId>();
      expectTypeOf<'deepseek-v4-flash-ga-260731'>().toMatchTypeOf<ByteDanceChatModelId>();
      expectTypeOf<'glm-5-2-260617'>().toMatchTypeOf<ByteDanceChatModelId>();
      expectTypeOf<string>().toMatchTypeOf<ByteDanceChatModelId>();
    });
  });
});
