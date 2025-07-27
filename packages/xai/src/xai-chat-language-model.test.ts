import { LanguageModelV2Prompt } from '@ai-sdk/provider';
import {
  convertReadableStreamToArray,
  createTestServer,
} from '@ai-sdk/provider-utils/test';
import { XaiChatLanguageModel } from './xai-chat-language-model';

const TEST_PROMPT: LanguageModelV2Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const testConfig = {
  provider: 'xai.chat',
  baseURL: 'https://api.x.ai/v1',
  headers: () => ({ authorization: 'Bearer test-api-key' }),
  generateId: () => 'test-id',
};

const model = new XaiChatLanguageModel('grok-beta', testConfig);

const server = createTestServer({
  'https://api.x.ai/v1/chat/completions': {},
});

describe('XaiChatLanguageModel', () => {
  it('should be instantiated correctly', () => {
    expect(model.modelId).toBe('grok-beta');
    expect(model.provider).toBe('xai.chat');
    expect(model.specificationVersion).toBe('v2');
  });

  it('should have supported URLs', () => {
    expect(model.supportedUrls).toEqual({
      'image/*': [/^https?:\/\/.*$/],
    });
  });

  describe('doGenerate', () => {
    function prepareJsonResponse({
      content = '',
      usage = {
        prompt_tokens: 4,
        total_tokens: 34,
        completion_tokens: 30,
      },
      id = 'chatcmpl-test-id',
      created = 1699472111,
      model = 'grok-beta',
      headers,
    }: {
      content?: string;
      usage?: {
        prompt_tokens: number;
        total_tokens: number;
        completion_tokens: number;
      };
      id?: string;
      created?: number;
      model?: string;
      headers?: Record<string, string>;
    }) {
      server.urls['https://api.x.ai/v1/chat/completions'].response = {
        type: 'json-value',
        headers,
        body: {
          id,
          object: 'chat.completion',
          created,
          model,
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content,
                tool_calls: null,
              },
              finish_reason: 'stop',
            },
          ],
          usage,
        },
      };
    }

    it('should extract text content', async () => {
      prepareJsonResponse({ content: 'Hello, World!' });

      const { content } = await model.doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(content).toMatchInlineSnapshot(`
        [
          {
            "text": "Hello, World!",
            "type": "text",
          },
        ]
      `);
    });

    it('should avoid duplication when there is a trailing assistant message', async () => {
      prepareJsonResponse({ content: 'prefix and more content' });

      const { content } = await model.doGenerate({
        prompt: [
          { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'prefix ' }],
          },
        ],
      });

      expect(content).toMatchInlineSnapshot(`
        [
          {
            "text": "prefix and more content",
            "type": "text",
          },
        ]
      `);
    });

    it('should extract tool call content', async () => {
      server.urls['https://api.x.ai/v1/chat/completions'].response = {
        type: 'json-value',
        body: {
          id: 'chatcmpl-test-tool-call',
          object: 'chat.completion',
          created: 1699472111,
          model: 'grok-beta',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'call_test123',
                    type: 'function',
                    function: {
                      name: 'weatherTool',
                      arguments: '{"location": "paris"}',
                    },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
          usage: {
            prompt_tokens: 124,
            total_tokens: 146,
            completion_tokens: 22,
          },
        },
      };

      const { content } = await model.doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(content).toMatchInlineSnapshot(`
        [
          {
            "input": "{"location": "paris"}",
            "toolCallId": "call_test123",
            "toolName": "weatherTool",
            "type": "tool-call",
          },
        ]
      `);
    });

    it('should extract usage', async () => {
      prepareJsonResponse({
        usage: { prompt_tokens: 20, total_tokens: 25, completion_tokens: 5 },
      });

      const { usage } = await model.doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(usage).toMatchInlineSnapshot(`
        {
          "inputTokens": 20,
          "outputTokens": 5,
          "reasoningTokens": undefined,
          "totalTokens": 25,
        }
      `);
    });

    it('should send additional response information', async () => {
      prepareJsonResponse({
        id: 'test-id',
        created: 123,
        model: 'test-model',
      });

      const { response } = await model.doGenerate({
        prompt: TEST_PROMPT,
      });

      expect({
        id: response?.id,
        timestamp: response?.timestamp,
        modelId: response?.modelId,
      }).toStrictEqual({
        id: 'test-id',
        timestamp: new Date(123 * 1000),
        modelId: 'test-model',
      });
    });

    it('should expose the raw response headers', async () => {
      prepareJsonResponse({
        headers: { 'test-header': 'test-value' },
      });

      const { response } = await model.doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(response?.headers).toStrictEqual({
        // default headers:
        'content-length': '271',
        'content-type': 'application/json',

        // custom header
        'test-header': 'test-value',
      });
    });

    it('should pass the model and the messages', async () => {
      prepareJsonResponse({ content: '' });

      await model.doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'grok-beta',
        messages: [{ role: 'user', content: 'Hello' }],
      });
    });

    it('should pass tools and toolChoice', async () => {
      prepareJsonResponse({ content: '' });

      await model.doGenerate({
        tools: [
          {
            type: 'function',
            name: 'test-tool',
            inputSchema: {
              type: 'object',
              properties: { value: { type: 'string' } },
              required: ['value'],
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
        ],
        toolChoice: {
          type: 'tool',
          toolName: 'test-tool',
        },
        prompt: TEST_PROMPT,
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'grok-beta',
        messages: [{ role: 'user', content: 'Hello' }],
        tools: [
          {
            type: 'function',
            function: {
              name: 'test-tool',
              parameters: {
                type: 'object',
                properties: { value: { type: 'string' } },
                required: ['value'],
                additionalProperties: false,
                $schema: 'http://json-schema.org/draft-07/schema#',
              },
            },
          },
        ],
        tool_choice: {
          type: 'function',
          function: { name: 'test-tool' },
        },
      });
    });

    it('should pass headers', async () => {
      prepareJsonResponse({ content: '' });

      const modelWithHeaders = new XaiChatLanguageModel('grok-beta', {
        provider: 'xai.chat',
        baseURL: 'https://api.x.ai/v1',
        headers: () => ({
          authorization: 'Bearer test-api-key',
          'Custom-Provider-Header': 'provider-header-value',
        }),
        generateId: () => 'test-id',
      });

      await modelWithHeaders.doGenerate({
        prompt: TEST_PROMPT,
        headers: {
          'Custom-Request-Header': 'request-header-value',
        },
      });

      const requestHeaders = server.calls[0].requestHeaders;

      expect(requestHeaders).toStrictEqual({
        authorization: 'Bearer test-api-key',
        'content-type': 'application/json',
        'custom-provider-header': 'provider-header-value',
        'custom-request-header': 'request-header-value',
      });
    });

    it('should send request body', async () => {
      prepareJsonResponse({ content: '' });

      const { request } = await model.doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(request).toMatchInlineSnapshot(`
        {
          "body": {
            "max_tokens": undefined,
            "messages": [
              {
                "content": "Hello",
                "role": "user",
              },
            ],
            "model": "grok-beta",
            "reasoning_effort": undefined,
            "response_format": undefined,
            "search_parameters": undefined,
            "seed": undefined,
            "temperature": undefined,
            "tool_choice": undefined,
            "tools": undefined,
            "top_p": undefined,
          },
        }
      `);
    });

    it('should pass search parameters', async () => {
      prepareJsonResponse({ content: '' });

      await model.doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: {
          xai: {
            searchParameters: {
              mode: 'auto',
              returnCitations: true,
              fromDate: '2024-01-01',
              toDate: '2024-12-31',
              maxSearchResults: 10,
            },
          },
        },
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'grok-beta',
        messages: [{ role: 'user', content: 'Hello' }],
        search_parameters: {
          mode: 'auto',
          return_citations: true,
          from_date: '2024-01-01',
          to_date: '2024-12-31',
          max_search_results: 10,
        },
      });
    });

    it('should pass search parameters with sources array', async () => {
      prepareJsonResponse({ content: '' });

      await model.doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: {
          xai: {
            searchParameters: {
              mode: 'on',
              sources: [
                {
                  type: 'web',
                  country: 'US',
                  excludedWebsites: ['example.com'],
                  safeSearch: false,
                },
                {
                  type: 'x',
                  xHandles: ['grok'],
                },
                {
                  type: 'news',
                  country: 'GB',
                },
                {
                  type: 'rss',
                  links: ['https://status.x.ai/feed.xml'],
                },
              ],
            },
          },
        },
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'grok-beta',
        messages: [{ role: 'user', content: 'Hello' }],
        search_parameters: {
          mode: 'on',
          sources: [
            {
              type: 'web',
              country: 'US',
              excluded_websites: ['example.com'],
              safe_search: false,
            },
            {
              type: 'x',
              x_handles: ['grok'],
            },
            {
              type: 'news',
              country: 'GB',
            },
            {
              type: 'rss',
              links: ['https://status.x.ai/feed.xml'],
            },
          ],
        },
      });
    });

    it('should extract content when message content is a content object', async () => {
      server.urls['https://api.x.ai/v1/chat/completions'].response = {
        type: 'json-value',
        body: {
          id: 'object-id',
          object: 'chat.completion',
          created: 1699472111,
          model: 'grok-beta',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'Hello from object',
                tool_calls: null,
              },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 4, total_tokens: 34, completion_tokens: 30 },
        },
      };

      const { content } = await model.doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(content).toMatchInlineSnapshot(`
        [
          {
            "text": "Hello from object",
            "type": "text",
          },
        ]
      `);
    });

    it('should extract citations as sources', async () => {
      server.urls['https://api.x.ai/v1/chat/completions'].response = {
        type: 'json-value',
        body: {
          id: 'citations-test',
          object: 'chat.completion',
          created: 1699472111,
          model: 'grok-beta',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'Here are the latest developments in AI.',
                tool_calls: null,
              },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 4, total_tokens: 34, completion_tokens: 30 },
          citations: [
            'https://example.com/article1',
            'https://example.com/article2',
          ],
        },
      };

      const { content } = await model.doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: {
          xai: {
            searchParameters: {
              mode: 'auto',
              returnCitations: true,
            },
          },
        },
      });

      expect(content).toMatchInlineSnapshot(`
        [
          {
            "text": "Here are the latest developments in AI.",
            "type": "text",
          },
          {
            "id": "test-id",
            "sourceType": "url",
            "type": "source",
            "url": "https://example.com/article1",
          },
          {
            "id": "test-id",
            "sourceType": "url",
            "type": "source",
            "url": "https://example.com/article2",
          },
        ]
      `);
    });

    it('should handle complex search parameter combinations', async () => {
      prepareJsonResponse({
        content: 'Research results from multiple sources',
      });

      await model.doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: {
          xai: {
            searchParameters: {
              mode: 'on',
              returnCitations: true,
              fromDate: '2024-01-01',
              toDate: '2024-12-31',
              maxSearchResults: 15,
              sources: [
                {
                  type: 'web',
                  country: 'US',
                  allowedWebsites: ['arxiv.org', 'nature.com'],
                  safeSearch: true,
                },
                {
                  type: 'news',
                  country: 'GB',
                  excludedWebsites: ['tabloid.com'],
                },
                {
                  type: 'x',
                  xHandles: ['openai', 'deepmind'],
                },
              ],
            },
          },
        },
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'grok-beta',
        messages: [{ role: 'user', content: 'Hello' }],
        search_parameters: {
          mode: 'on',
          return_citations: true,
          from_date: '2024-01-01',
          to_date: '2024-12-31',
          max_search_results: 15,
          sources: [
            {
              type: 'web',
              country: 'US',
              allowed_websites: ['arxiv.org', 'nature.com'],
              safe_search: true,
            },
            {
              type: 'news',
              country: 'GB',
              excluded_websites: ['tabloid.com'],
            },
            {
              type: 'x',
              x_handles: ['openai', 'deepmind'],
            },
          ],
        },
      });
    });

    it('should handle empty citations array', async () => {
      server.urls['https://api.x.ai/v1/chat/completions'].response = {
        type: 'json-value',
        body: {
          id: 'no-citations-test',
          object: 'chat.completion',
          created: 1699472111,
          model: 'grok-beta',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'Response without citations.',
                tool_calls: null,
              },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 4, total_tokens: 34, completion_tokens: 30 },
          citations: [],
        },
      };

      const { content } = await model.doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: {
          xai: {
            searchParameters: {
              mode: 'auto',
              returnCitations: true,
            },
          },
        },
      });

      expect(content).toMatchInlineSnapshot(`
        [
          {
            "text": "Response without citations.",
            "type": "text",
          },
        ]
      `);
    });
  });

  describe('doStream', () => {
    function prepareStreamResponse({
      content,
      headers,
    }: {
      content: string[];
      headers?: Record<string, string>;
    }) {
      server.urls['https://api.x.ai/v1/chat/completions'].response = {
        type: 'stream-chunks',
        headers,
        chunks: [
          `data: {"id":"35e18f56-4ec6-48e4-8ca0-c1c4cbeeebbe","object":"chat.completion.chunk",` +
            `"created":1750537778,"model":"grok-beta","choices":[{"index":0,` +
            `"delta":{"role":"assistant","content":""},"finish_reason":null}],"system_fingerprint":"fp_13a6dc65a6"}\n\n`,
          ...content.map(text => {
            return (
              `data: {"id":"35e18f56-4ec6-48e4-8ca0-c1c4cbeeebbe","object":"chat.completion.chunk",` +
              `"created":1750537778,"model":"grok-beta","choices":[{"index":0,` +
              `"delta":{"role":"assistant","content":"${text}"},"finish_reason":null}],"system_fingerprint":"fp_13a6dc65a6"}\n\n`
            );
          }),
          `data: {"id":"35e18f56-4ec6-48e4-8ca0-c1c4cbeeebbe","object":"chat.completion.chunk",` +
            `"created":1750537778,"model":"grok-beta","choices":[{"index":0,` +
            `"delta":{"content":""},"finish_reason":"stop"}],` +
            `"usage":{"prompt_tokens":4,"total_tokens":36,"completion_tokens":32},"system_fingerprint":"fp_13a6dc65a6"}\n\n`,
          `data: [DONE]\n\n`,
        ],
      };
    }

    it('should stream text deltas', async () => {
      prepareStreamResponse({ content: ['Hello', ', ', 'world!'] });

      const { stream } = await model.doStream({
        prompt: TEST_PROMPT,
        includeRawChunks: false,
      });

      expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
        [
          {
            "type": "stream-start",
            "warnings": [],
          },
          {
            "id": "35e18f56-4ec6-48e4-8ca0-c1c4cbeeebbe",
            "modelId": "grok-beta",
            "timestamp": 2025-06-21T20:29:38.000Z,
            "type": "response-metadata",
          },
          {
            "id": "text-35e18f56-4ec6-48e4-8ca0-c1c4cbeeebbe",
            "type": "text-start",
          },
          {
            "delta": "Hello",
            "id": "text-35e18f56-4ec6-48e4-8ca0-c1c4cbeeebbe",
            "type": "text-delta",
          },
          {
            "delta": ", ",
            "id": "text-35e18f56-4ec6-48e4-8ca0-c1c4cbeeebbe",
            "type": "text-delta",
          },
          {
            "delta": "world!",
            "id": "text-35e18f56-4ec6-48e4-8ca0-c1c4cbeeebbe",
            "type": "text-delta",
          },
          {
            "id": "text-35e18f56-4ec6-48e4-8ca0-c1c4cbeeebbe",
            "type": "text-end",
          },
          {
            "finishReason": "stop",
            "type": "finish",
            "usage": {
              "inputTokens": 4,
              "outputTokens": 32,
              "reasoningTokens": undefined,
              "totalTokens": 36,
            },
          },
        ]
      `);
    });

    it('should avoid duplication when there is a trailing assistant message', async () => {
      prepareStreamResponse({ content: ['prefix', ' and', ' more content'] });

      const { stream } = await model.doStream({
        prompt: [
          { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'prefix ' }],
          },
        ],
        includeRawChunks: false,
      });

      expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
        [
          {
            "type": "stream-start",
            "warnings": [],
          },
          {
            "id": "35e18f56-4ec6-48e4-8ca0-c1c4cbeeebbe",
            "modelId": "grok-beta",
            "timestamp": 2025-06-21T20:29:38.000Z,
            "type": "response-metadata",
          },
          {
            "id": "text-35e18f56-4ec6-48e4-8ca0-c1c4cbeeebbe",
            "type": "text-start",
          },
          {
            "delta": "prefix",
            "id": "text-35e18f56-4ec6-48e4-8ca0-c1c4cbeeebbe",
            "type": "text-delta",
          },
          {
            "delta": " and",
            "id": "text-35e18f56-4ec6-48e4-8ca0-c1c4cbeeebbe",
            "type": "text-delta",
          },
          {
            "delta": " more content",
            "id": "text-35e18f56-4ec6-48e4-8ca0-c1c4cbeeebbe",
            "type": "text-delta",
          },
          {
            "id": "text-35e18f56-4ec6-48e4-8ca0-c1c4cbeeebbe",
            "type": "text-end",
          },
          {
            "finishReason": "stop",
            "type": "finish",
            "usage": {
              "inputTokens": 4,
              "outputTokens": 32,
              "reasoningTokens": undefined,
              "totalTokens": 36,
            },
          },
        ]
      `);
    });

    it('should stream tool deltas', async () => {
      server.urls['https://api.x.ai/v1/chat/completions'].response = {
        type: 'stream-chunks',
        chunks: [
          `data: {"id":"a9648117-740c-4270-9e07-6a8457f23b7a","object":"chat.completion.chunk","created":1750535985,"model":"grok-beta",` +
            `"choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}],"system_fingerprint":"fp_13a6dc65a6"}\n\n`,
          `data: {"id":"a9648117-740c-4270-9e07-6a8457f23b7a","object":"chat.completion.chunk","created":1750535985,"model":"grok-beta",` +
            `"choices":[{"index":0,"delta":{"content":null,"tool_calls":[{"id":"call_yfBEybNYi","type":"function","function":{"name":"test-tool","arguments":` +
            `"{\\"value\\":\\"Sparkle Day\\"}"` +
            `}}]},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":183,"total_tokens":316,"completion_tokens":133},"system_fingerprint":"fp_13a6dc65a6"}\n\n`,
          'data: [DONE]\n\n',
        ],
      };

      const { stream } = await model.doStream({
        tools: [
          {
            type: 'function',
            name: 'test-tool',
            inputSchema: {
              type: 'object',
              properties: { value: { type: 'string' } },
              required: ['value'],
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
        ],
        prompt: TEST_PROMPT,
        includeRawChunks: false,
      });

      expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
        [
          {
            "type": "stream-start",
            "warnings": [],
          },
          {
            "id": "a9648117-740c-4270-9e07-6a8457f23b7a",
            "modelId": "grok-beta",
            "timestamp": 2025-06-21T19:59:45.000Z,
            "type": "response-metadata",
          },
          {
            "id": "call_yfBEybNYi",
            "toolName": "test-tool",
            "type": "tool-input-start",
          },
          {
            "delta": "{"value":"Sparkle Day"}",
            "id": "call_yfBEybNYi",
            "type": "tool-input-delta",
          },
          {
            "id": "call_yfBEybNYi",
            "type": "tool-input-end",
          },
          {
            "input": "{"value":"Sparkle Day"}",
            "toolCallId": "call_yfBEybNYi",
            "toolName": "test-tool",
            "type": "tool-call",
          },
          {
            "finishReason": "tool-calls",
            "type": "finish",
            "usage": {
              "inputTokens": 183,
              "outputTokens": 133,
              "reasoningTokens": undefined,
              "totalTokens": 316,
            },
          },
        ]
      `);
    });

    it('should expose the raw response headers', async () => {
      prepareStreamResponse({
        content: [],
        headers: { 'test-header': 'test-value' },
      });

      const { response } = await model.doStream({
        prompt: TEST_PROMPT,
        includeRawChunks: false,
      });

      expect(response?.headers).toStrictEqual({
        // default headers:
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',

        // custom header
        'test-header': 'test-value',
      });
    });

    it('should pass the messages', async () => {
      prepareStreamResponse({ content: [''] });

      await model.doStream({
        prompt: TEST_PROMPT,
        includeRawChunks: false,
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        stream: true,
        model: 'grok-beta',
        messages: [{ role: 'user', content: 'Hello' }],
        stream_options: {
          include_usage: true,
        },
      });
    });

    it('should pass headers', async () => {
      prepareStreamResponse({ content: [] });

      const modelWithHeaders = new XaiChatLanguageModel('grok-beta', {
        provider: 'xai.chat',
        baseURL: 'https://api.x.ai/v1',
        headers: () => ({
          authorization: 'Bearer test-api-key',
          'Custom-Provider-Header': 'provider-header-value',
        }),
        generateId: () => 'test-id',
      });

      await modelWithHeaders.doStream({
        prompt: TEST_PROMPT,
        includeRawChunks: false,
        headers: {
          'Custom-Request-Header': 'request-header-value',
        },
      });

      expect(server.calls[0].requestHeaders).toStrictEqual({
        authorization: 'Bearer test-api-key',
        'content-type': 'application/json',
        'custom-provider-header': 'provider-header-value',
        'custom-request-header': 'request-header-value',
      });
    });

    it('should send request body', async () => {
      prepareStreamResponse({ content: [] });

      const { request } = await model.doStream({
        prompt: TEST_PROMPT,
        includeRawChunks: false,
      });

      expect(request).toMatchInlineSnapshot(`
        {
          "body": {
            "max_tokens": undefined,
            "messages": [
              {
                "content": "Hello",
                "role": "user",
              },
            ],
            "model": "grok-beta",
            "reasoning_effort": undefined,
            "response_format": undefined,
            "search_parameters": undefined,
            "seed": undefined,
            "stream": true,
            "stream_options": {
              "include_usage": true,
            },
            "temperature": undefined,
            "tool_choice": undefined,
            "tools": undefined,
            "top_p": undefined,
          },
        }
      `);
    });

    it('should stream citations as sources', async () => {
      server.urls['https://api.x.ai/v1/chat/completions'].response = {
        type: 'stream-chunks',
        chunks: [
          `data: {"id":"c8e45f92-7a3b-4d8e-9c1f-5e6a8b9d2f4c","object":"chat.completion.chunk","created":1750538200,"model":"grok-beta",` +
            `"choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}],"system_fingerprint":"fp_13a6dc65a6"}\n\n`,
          `data: {"id":"c8e45f92-7a3b-4d8e-9c1f-5e6a8b9d2f4c","object":"chat.completion.chunk","created":1750538200,"model":"grok-beta",` +
            `"choices":[{"index":0,"delta":{"content":"Latest AI news"},"finish_reason":null}],"system_fingerprint":"fp_13a6dc65a6"}\n\n`,
          `data: {"id":"c8e45f92-7a3b-4d8e-9c1f-5e6a8b9d2f4c","object":"chat.completion.chunk","created":1750538200,"model":"grok-beta",` +
            `"choices":[{"index":0,"delta":{},"finish_reason":"stop"}],` +
            `"usage":{"prompt_tokens":4,"total_tokens":34,"completion_tokens":30},` +
            `"citations":["https://example.com/source1","https://example.com/source2"],"system_fingerprint":"fp_13a6dc65a6"}\n\n`,
          `data: [DONE]\n\n`,
        ],
      };

      const { stream } = await model.doStream({
        prompt: TEST_PROMPT,
        includeRawChunks: false,
        providerOptions: {
          xai: {
            searchParameters: {
              mode: 'auto',
              returnCitations: true,
            },
          },
        },
      });

      expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
        [
          {
            "type": "stream-start",
            "warnings": [],
          },
          {
            "id": "c8e45f92-7a3b-4d8e-9c1f-5e6a8b9d2f4c",
            "modelId": "grok-beta",
            "timestamp": 2025-06-21T20:36:40.000Z,
            "type": "response-metadata",
          },
          {
            "id": "text-c8e45f92-7a3b-4d8e-9c1f-5e6a8b9d2f4c",
            "type": "text-start",
          },
          {
            "delta": "Latest AI news",
            "id": "text-c8e45f92-7a3b-4d8e-9c1f-5e6a8b9d2f4c",
            "type": "text-delta",
          },
          {
            "id": "test-id",
            "sourceType": "url",
            "type": "source",
            "url": "https://example.com/source1",
          },
          {
            "id": "test-id",
            "sourceType": "url",
            "type": "source",
            "url": "https://example.com/source2",
          },
          {
            "id": "text-c8e45f92-7a3b-4d8e-9c1f-5e6a8b9d2f4c",
            "type": "text-end",
          },
          {
            "finishReason": "stop",
            "type": "finish",
            "usage": {
              "inputTokens": 4,
              "outputTokens": 30,
              "reasoningTokens": undefined,
              "totalTokens": 34,
            },
          },
        ]
      `);
    });
  });

  describe('reasoning models', () => {
    const reasoningModel = new XaiChatLanguageModel('grok-3-mini', testConfig);

    function prepareReasoningResponse({
      content = 'The result is 303.',
      reasoning_content = 'Let me calculate 101 multiplied by 3: 101 * 3 = 303.',
      usage = {
        prompt_tokens: 15,
        total_tokens: 35,
        completion_tokens: 20,
        completion_tokens_details: {
          reasoning_tokens: 10,
        },
      },
    }: {
      content?: string;
      reasoning_content?: string;
      usage?: {
        prompt_tokens: number;
        total_tokens: number;
        completion_tokens: number;
        completion_tokens_details?: {
          reasoning_tokens?: number;
        };
      };
    }) {
      server.urls['https://api.x.ai/v1/chat/completions'].response = {
        type: 'json-value',
        body: {
          id: 'chatcmpl-reasoning-test',
          object: 'chat.completion',
          created: 1699472111,
          model: 'grok-3-mini',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content,
                reasoning_content,
                tool_calls: null,
              },
              finish_reason: 'stop',
            },
          ],
          usage,
        },
      };
    }

    it('should pass reasoning_effort parameter', async () => {
      prepareReasoningResponse({});

      await reasoningModel.doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: {
          xai: { reasoningEffort: 'high' },
        },
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'grok-3-mini',
        messages: [{ role: 'user', content: 'Hello' }],
        reasoning_effort: 'high',
      });
    });

    it('should extract reasoning content', async () => {
      prepareReasoningResponse({
        content: 'The answer is 303.',
        reasoning_content: 'Let me think: 101 * 3 = 303.',
      });

      const { content } = await reasoningModel.doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: {
          xai: { reasoningEffort: 'low' },
        },
      });

      expect(content).toMatchInlineSnapshot(`
        [
          {
            "text": "The answer is 303.",
            "type": "text",
          },
          {
            "text": "Let me think: 101 * 3 = 303.",
            "type": "reasoning",
          },
        ]
      `);
    });

    it('should extract reasoning tokens from usage', async () => {
      prepareReasoningResponse({
        usage: {
          prompt_tokens: 15,
          completion_tokens: 20,
          total_tokens: 35,
          completion_tokens_details: {
            reasoning_tokens: 10,
          },
        },
      });

      const { usage } = await reasoningModel.doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: {
          xai: { reasoningEffort: 'high' },
        },
      });

      expect(usage).toMatchInlineSnapshot(`
        {
          "inputTokens": 15,
          "outputTokens": 20,
          "reasoningTokens": 10,
          "totalTokens": 35,
        }
      `);
    });

    it('should handle reasoning streaming', async () => {
      server.urls['https://api.x.ai/v1/chat/completions'].response = {
        type: 'stream-chunks',
        chunks: [
          `data: {"id":"b7f32e89-8d6c-4a1e-9f5b-2c8e7a9d4f6b","object":"chat.completion.chunk","created":1750538120,"model":"grok-3-mini",` +
            `"choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}],"system_fingerprint":"fp_reasoning_v1"}\n\n`,
          `data: {"id":"b7f32e89-8d6c-4a1e-9f5b-2c8e7a9d4f6b","object":"chat.completion.chunk","created":1750538120,"model":"grok-3-mini",` +
            `"choices":[{"index":0,"delta":{"reasoning_content":"Let me calculate: "},"finish_reason":null}],"system_fingerprint":"fp_reasoning_v1"}\n\n`,
          `data: {"id":"b7f32e89-8d6c-4a1e-9f5b-2c8e7a9d4f6b","object":"chat.completion.chunk","created":1750538120,"model":"grok-3-mini",` +
            `"choices":[{"index":0,"delta":{"reasoning_content":"101 * 3 = 303"},"finish_reason":null}],"system_fingerprint":"fp_reasoning_v1"}\n\n`,
          `data: {"id":"b7f32e89-8d6c-4a1e-9f5b-2c8e7a9d4f6b","object":"chat.completion.chunk","created":1750538120,"model":"grok-3-mini",` +
            `"choices":[{"index":0,"delta":{"content":"The answer is 303."},"finish_reason":null}],"system_fingerprint":"fp_reasoning_v1"}\n\n`,
          `data: {"id":"b7f32e89-8d6c-4a1e-9f5b-2c8e7a9d4f6b","object":"chat.completion.chunk","created":1750538120,"model":"grok-3-mini",` +
            `"choices":[{"index":0,"delta":{},"finish_reason":"stop"}],` +
            `"usage":{"prompt_tokens":15,"total_tokens":35,"completion_tokens":20,"completion_tokens_details":{"reasoning_tokens":10}},"system_fingerprint":"fp_reasoning_v1"}\n\n`,
          `data: [DONE]\n\n`,
        ],
      };

      const { stream } = await reasoningModel.doStream({
        prompt: TEST_PROMPT,
        includeRawChunks: false,
        providerOptions: {
          xai: { reasoningEffort: 'low' },
        },
      });

      expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
        [
          {
            "type": "stream-start",
            "warnings": [],
          },
          {
            "id": "b7f32e89-8d6c-4a1e-9f5b-2c8e7a9d4f6b",
            "modelId": "grok-3-mini",
            "timestamp": 2025-06-21T20:35:20.000Z,
            "type": "response-metadata",
          },
          {
            "id": "reasoning-b7f32e89-8d6c-4a1e-9f5b-2c8e7a9d4f6b",
            "type": "reasoning-start",
          },
          {
            "delta": "Let me calculate: ",
            "id": "reasoning-b7f32e89-8d6c-4a1e-9f5b-2c8e7a9d4f6b",
            "type": "reasoning-delta",
          },
          {
            "delta": "101 * 3 = 303",
            "id": "reasoning-b7f32e89-8d6c-4a1e-9f5b-2c8e7a9d4f6b",
            "type": "reasoning-delta",
          },
          {
            "id": "text-b7f32e89-8d6c-4a1e-9f5b-2c8e7a9d4f6b",
            "type": "text-start",
          },
          {
            "delta": "The answer is 303.",
            "id": "text-b7f32e89-8d6c-4a1e-9f5b-2c8e7a9d4f6b",
            "type": "text-delta",
          },
          {
            "id": "reasoning-b7f32e89-8d6c-4a1e-9f5b-2c8e7a9d4f6b",
            "type": "reasoning-end",
          },
          {
            "id": "text-b7f32e89-8d6c-4a1e-9f5b-2c8e7a9d4f6b",
            "type": "text-end",
          },
          {
            "finishReason": "stop",
            "type": "finish",
            "usage": {
              "inputTokens": 15,
              "outputTokens": 20,
              "reasoningTokens": 10,
              "totalTokens": 35,
            },
          },
        ]
      `);
    });

    it('should deduplicate repetitive reasoning deltas', async () => {
      server.urls['https://api.x.ai/v1/chat/completions'].response = {
        type: 'stream-chunks',
        chunks: [
          `data: {"id":"grok-4-test","object":"chat.completion.chunk","created":1750538120,"model":"grok-4-0709",` +
            `"choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}],"system_fingerprint":"fp_reasoning_v1"}\n\n`,
          // Multiple identical "Thinking..." deltas (simulating Grok 4 issue)
          `data: {"id":"grok-4-test","object":"chat.completion.chunk","created":1750538120,"model":"grok-4-0709",` +
            `"choices":[{"index":0,"delta":{"reasoning_content":"Thinking... "},"finish_reason":null}],"system_fingerprint":"fp_reasoning_v1"}\n\n`,
          `data: {"id":"grok-4-test","object":"chat.completion.chunk","created":1750538120,"model":"grok-4-0709",` +
            `"choices":[{"index":0,"delta":{"reasoning_content":"Thinking... "},"finish_reason":null}],"system_fingerprint":"fp_reasoning_v1"}\n\n`,
          `data: {"id":"grok-4-test","object":"chat.completion.chunk","created":1750538120,"model":"grok-4-0709",` +
            `"choices":[{"index":0,"delta":{"reasoning_content":"Thinking... "},"finish_reason":null}],"system_fingerprint":"fp_reasoning_v1"}\n\n`,
          // Different reasoning content should still come through
          `data: {"id":"grok-4-test","object":"chat.completion.chunk","created":1750538120,"model":"grok-4-0709",` +
            `"choices":[{"index":0,"delta":{"reasoning_content":"Actually calculating now..."},"finish_reason":null}],"system_fingerprint":"fp_reasoning_v1"}\n\n`,
          `data: {"id":"grok-4-test","object":"chat.completion.chunk","created":1750538120,"model":"grok-4-0709",` +
            `"choices":[{"index":0,"delta":{"content":"The answer is 42."},"finish_reason":null}],"system_fingerprint":"fp_reasoning_v1"}\n\n`,
          `data: {"id":"grok-4-test","object":"chat.completion.chunk","created":1750538120,"model":"grok-4-0709",` +
            `"choices":[{"index":0,"delta":{},"finish_reason":"stop"}],` +
            `"usage":{"prompt_tokens":15,"total_tokens":35,"completion_tokens":20,"completion_tokens_details":{"reasoning_tokens":10}},"system_fingerprint":"fp_reasoning_v1"}\n\n`,
          `data: [DONE]\n\n`,
        ],
      };

      const { stream } = await reasoningModel.doStream({
        prompt: TEST_PROMPT,
        includeRawChunks: false,
        providerOptions: {
          xai: { reasoningEffort: 'low' },
        },
      });

      expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
        [
          {
            "type": "stream-start",
            "warnings": [],
          },
          {
            "id": "grok-4-test",
            "modelId": "grok-4-0709",
            "timestamp": 2025-06-21T20:35:20.000Z,
            "type": "response-metadata",
          },
          {
            "id": "reasoning-grok-4-test",
            "type": "reasoning-start",
          },
          {
            "delta": "Thinking... ",
            "id": "reasoning-grok-4-test",
            "type": "reasoning-delta",
          },
          {
            "delta": "Actually calculating now...",
            "id": "reasoning-grok-4-test",
            "type": "reasoning-delta",
          },
          {
            "id": "text-grok-4-test",
            "type": "text-start",
          },
          {
            "delta": "The answer is 42.",
            "id": "text-grok-4-test",
            "type": "text-delta",
          },
          {
            "id": "reasoning-grok-4-test",
            "type": "reasoning-end",
          },
          {
            "id": "text-grok-4-test",
            "type": "text-end",
          },
          {
            "finishReason": "stop",
            "type": "finish",
            "usage": {
              "inputTokens": 15,
              "outputTokens": 20,
              "reasoningTokens": 10,
              "totalTokens": 35,
            },
          },
        ]
      `);
    });
  });
});

describe('doStream with raw chunks', () => {
  it('should stream raw chunks when includeRawChunks is true', async () => {
    server.urls['https://api.x.ai/v1/chat/completions'].response = {
      type: 'stream-chunks',
      chunks: [
        `data: {"id":"d9f56e23-8b4c-4e7a-9d2f-6c8a9b5e3f7d","object":"chat.completion.chunk","created":1750538300,"model":"grok-beta","choices":[{"index":0,"delta":{"role":"assistant","content":"Hello"},"finish_reason":null}],"system_fingerprint":"fp_13a6dc65a6"}\n\n`,
        `data: {"id":"e2a47b89-3f6d-4c8e-9a1b-7d5f8c9e2a4b","object":"chat.completion.chunk","created":1750538301,"model":"grok-beta","choices":[{"index":0,"delta":{"content":" world"},"finish_reason":null}],"system_fingerprint":"fp_13a6dc65a6"}\n\n`,
        `data: {"id":"f3b58c9a-4e7f-5d9e-ab2c-8e6f9d0e3b5c","object":"chat.completion.chunk","created":1750538302,"model":"grok-beta","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15},"citations":["https://example.com"],"system_fingerprint":"fp_13a6dc65a6"}\n\n`,
        'data: [DONE]\n\n',
      ],
    };

    const { stream } = await model.doStream({
      prompt: TEST_PROMPT,
      includeRawChunks: true,
    });

    const chunks = await convertReadableStreamToArray(stream);

    expect(chunks).toMatchInlineSnapshot(`
      [
        {
          "type": "stream-start",
          "warnings": [],
        },
        {
          "rawValue": {
            "choices": [
              {
                "delta": {
                  "content": "Hello",
                  "role": "assistant",
                },
                "finish_reason": null,
                "index": 0,
              },
            ],
            "created": 1750538300,
            "id": "d9f56e23-8b4c-4e7a-9d2f-6c8a9b5e3f7d",
            "model": "grok-beta",
            "object": "chat.completion.chunk",
            "system_fingerprint": "fp_13a6dc65a6",
          },
          "type": "raw",
        },
        {
          "id": "d9f56e23-8b4c-4e7a-9d2f-6c8a9b5e3f7d",
          "modelId": "grok-beta",
          "timestamp": 2025-06-21T20:38:20.000Z,
          "type": "response-metadata",
        },
        {
          "id": "text-d9f56e23-8b4c-4e7a-9d2f-6c8a9b5e3f7d",
          "type": "text-start",
        },
        {
          "delta": "Hello",
          "id": "text-d9f56e23-8b4c-4e7a-9d2f-6c8a9b5e3f7d",
          "type": "text-delta",
        },
        {
          "rawValue": {
            "choices": [
              {
                "delta": {
                  "content": " world",
                },
                "finish_reason": null,
                "index": 0,
              },
            ],
            "created": 1750538301,
            "id": "e2a47b89-3f6d-4c8e-9a1b-7d5f8c9e2a4b",
            "model": "grok-beta",
            "object": "chat.completion.chunk",
            "system_fingerprint": "fp_13a6dc65a6",
          },
          "type": "raw",
        },
        {
          "id": "text-e2a47b89-3f6d-4c8e-9a1b-7d5f8c9e2a4b",
          "type": "text-start",
        },
        {
          "delta": " world",
          "id": "text-e2a47b89-3f6d-4c8e-9a1b-7d5f8c9e2a4b",
          "type": "text-delta",
        },
        {
          "rawValue": {
            "choices": [
              {
                "delta": {},
                "finish_reason": "stop",
                "index": 0,
              },
            ],
            "citations": [
              "https://example.com",
            ],
            "created": 1750538302,
            "id": "f3b58c9a-4e7f-5d9e-ab2c-8e6f9d0e3b5c",
            "model": "grok-beta",
            "object": "chat.completion.chunk",
            "system_fingerprint": "fp_13a6dc65a6",
            "usage": {
              "completion_tokens": 5,
              "prompt_tokens": 10,
              "total_tokens": 15,
            },
          },
          "type": "raw",
        },
        {
          "id": "test-id",
          "sourceType": "url",
          "type": "source",
          "url": "https://example.com",
        },
        {
          "id": "text-d9f56e23-8b4c-4e7a-9d2f-6c8a9b5e3f7d",
          "type": "text-end",
        },
        {
          "id": "text-e2a47b89-3f6d-4c8e-9a1b-7d5f8c9e2a4b",
          "type": "text-end",
        },
        {
          "finishReason": "stop",
          "type": "finish",
          "usage": {
            "inputTokens": 10,
            "outputTokens": 5,
            "reasoningTokens": undefined,
            "totalTokens": 15,
          },
        },
      ]
    `);
  });
});
