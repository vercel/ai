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
            "text": "and more content",
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
            "args": "{"location": "paris"}",
            "toolCallId": "call_test123",
            "toolCallType": "function",
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
            parameters: {
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
            "response_format": undefined,
            "seed": undefined,
            "temperature": undefined,
            "tool_choice": undefined,
            "tools": undefined,
            "top_p": undefined,
          },
        }
      `);
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
          `data: {"id":"test-stream-id","object":"chat.completion.chunk",` +
            `"created":1699472111,"model":"grok-beta","choices":[{"index":0,` +
            `"delta":{"role":"assistant","content":""},"finish_reason":null}]}\n\n`,
          ...content.map(text => {
            return (
              `data: {"id":"test-stream-id","object":"chat.completion.chunk",` +
              `"created":1699472111,"model":"grok-beta","choices":[{"index":0,` +
              `"delta":{"role":"assistant","content":"${text}"},"finish_reason":null}]}\n\n`
            );
          }),
          `data: {"id":"test-stream-id","object":"chat.completion.chunk",` +
            `"created":1699472111,"model":"grok-beta","choices":[{"index":0,` +
            `"delta":{"content":""},"finish_reason":"stop"}],` +
            `"usage":{"prompt_tokens":4,"total_tokens":36,"completion_tokens":32}}\n\n`,
          `data: [DONE]\n\n`,
        ],
      };
    }

    it('should stream text deltas', async () => {
      prepareStreamResponse({ content: ['Hello', ', ', 'world!'] });

      const { stream } = await model.doStream({
        prompt: TEST_PROMPT,
      });

      expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
        [
          {
            "type": "stream-start",
            "warnings": [],
          },
          {
            "id": "test-stream-id",
            "modelId": "grok-beta",
            "timestamp": 2023-11-08T19:35:11.000Z,
            "type": "response-metadata",
          },
          {
            "text": "Hello",
            "type": "text",
          },
          {
            "text": ", ",
            "type": "text",
          },
          {
            "text": "world!",
            "type": "text",
          },
          {
            "finishReason": "stop",
            "type": "finish",
            "usage": {
              "inputTokens": 4,
              "outputTokens": 32,
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
      });

      expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
        [
          {
            "type": "stream-start",
            "warnings": [],
          },
          {
            "id": "test-stream-id",
            "modelId": "grok-beta",
            "timestamp": 2023-11-08T19:35:11.000Z,
            "type": "response-metadata",
          },
          {
            "text": "prefix",
            "type": "text",
          },
          {
            "text": " and",
            "type": "text",
          },
          {
            "text": " more content",
            "type": "text",
          },
          {
            "finishReason": "stop",
            "type": "finish",
            "usage": {
              "inputTokens": 4,
              "outputTokens": 32,
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
          `data: {"id":"test-stream-tool-id","object":"chat.completion.chunk","created":1699472111,"model":"grok-beta",` +
            `"choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}\n\n`,
          `data: {"id":"test-stream-tool-id","object":"chat.completion.chunk","created":1699472111,"model":"grok-beta",` +
            `"choices":[{"index":0,"delta":{"content":null,"tool_calls":[{"id":"call_test123","type":"function","function":{"name":"test-tool","arguments":` +
            `"{\\"value\\":\\"Sparkle Day\\"}"` +
            `}}]},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":183,"total_tokens":316,"completion_tokens":133}}\n\n`,
          'data: [DONE]\n\n',
        ],
      };

      const { stream } = await model.doStream({
        tools: [
          {
            type: 'function',
            name: 'test-tool',
            parameters: {
              type: 'object',
              properties: { value: { type: 'string' } },
              required: ['value'],
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
        ],
        prompt: TEST_PROMPT,
      });

      expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
        [
          {
            "type": "stream-start",
            "warnings": [],
          },
          {
            "id": "test-stream-tool-id",
            "modelId": "grok-beta",
            "timestamp": 2023-11-08T19:35:11.000Z,
            "type": "response-metadata",
          },
          {
            "argsTextDelta": "{"value":"Sparkle Day"}",
            "toolCallId": "call_test123",
            "toolCallType": "function",
            "toolName": "test-tool",
            "type": "tool-call-delta",
          },
          {
            "args": "{"value":"Sparkle Day"}",
            "toolCallId": "call_test123",
            "toolCallType": "function",
            "toolName": "test-tool",
            "type": "tool-call",
          },
          {
            "finishReason": "tool-calls",
            "type": "finish",
            "usage": {
              "inputTokens": 183,
              "outputTokens": 133,
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
      });

      await modelWithHeaders.doStream({
        prompt: TEST_PROMPT,
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
            "response_format": undefined,
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
  });
});
