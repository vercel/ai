import { LanguageModelV2Prompt } from '@ai-sdk/provider';
import {
  convertReadableStreamToArray,
  createTestServer,
} from '@ai-sdk/provider-utils/test';
import { createMistral } from './mistral-provider';

const TEST_PROMPT: LanguageModelV2Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const provider = createMistral({ apiKey: 'test-api-key' });
const model = provider.chat('mistral-small-latest');

const server = createTestServer({
  'https://api.mistral.ai/v1/chat/completions': {},
});

describe('doGenerate', () => {
  function prepareJsonResponse({
    content = '',
    usage = {
      prompt_tokens: 4,
      total_tokens: 34,
      completion_tokens: 30,
    },
    id = '16362f24e60340d0994dd205c267a43a',
    created = 1711113008,
    model = 'mistral-small-latest',
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
    server.urls['https://api.mistral.ai/v1/chat/completions'].response = {
      type: 'json-value',
      headers,
      body: {
        object: 'chat.completion',
        id,
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
            logprobs: null,
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
    server.urls['https://api.mistral.ai/v1/chat/completions'].response = {
      type: 'json-value',
      body: {
        id: 'b3999b8c93e04e11bcbff7bcab829667',
        object: 'chat.completion',
        created: 1722349660,
        model: 'mistral-large-latest',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              tool_calls: [
                {
                  id: 'gSIMJiOkT',
                  function: {
                    name: 'weatherTool',
                    arguments: '{"location": "paris"}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
            logprobs: null,
          },
        ],
        usage: { prompt_tokens: 124, total_tokens: 146, completion_tokens: 22 },
      },
    };

    const { content } = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(content).toMatchInlineSnapshot(`
      [
        {
          "args": "{"location": "paris"}",
          "toolCallId": "gSIMJiOkT",
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
      'content-length': '314',
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
      model: 'mistral-small-latest',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
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
      model: 'mistral-small-latest',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
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
      tool_choice: 'any',
    });
  });

  it('should pass headers', async () => {
    prepareJsonResponse({ content: '' });

    const provider = createMistral({
      apiKey: 'test-api-key',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await provider.chat('mistral-small-latest').doGenerate({
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
          "document_image_limit": undefined,
          "document_page_limit": undefined,
          "max_tokens": undefined,
          "messages": [
            {
              "content": [
                {
                  "text": "Hello",
                  "type": "text",
                },
              ],
              "role": "user",
            },
          ],
          "model": "mistral-small-latest",
          "random_seed": undefined,
          "response_format": undefined,
          "safe_prompt": undefined,
          "temperature": undefined,
          "tool_choice": undefined,
          "tools": undefined,
          "top_p": undefined,
        },
      }
    `);
  });

  it('should extract content when message content is a content object', async () => {
    server.urls['https://api.mistral.ai/v1/chat/completions'].response = {
      type: 'json-value',
      body: {
        object: 'chat.completion',
        id: 'object-id',
        created: 1711113008,
        model: 'mistral-small-latest',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: [
                {
                  type: 'text',
                  text: 'Hello from object',
                },
              ],
              tool_calls: null,
            },
            finish_reason: 'stop',
            logprobs: null,
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

  it('should return raw text with think tags for reasoning models', async () => {
    const reasoningModel = provider.chat('magistral-small-2506');

    prepareJsonResponse({
      content:
        "<think>\nLet me think about this problem step by step.\nFirst, I need to understand what the user is asking.\nThen I can provide a helpful response.\n</think>\n\nHello! I'm ready to help you with your question.",
    });

    const { content } = await reasoningModel.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(content).toMatchInlineSnapshot(`
      [
        {
          "text": "<think>
      Let me think about this problem step by step.
      First, I need to understand what the user is asking.
      Then I can provide a helpful response.
      </think>

      Hello! I'm ready to help you with your question.",
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
    server.urls['https://api.mistral.ai/v1/chat/completions'].response = {
      type: 'stream-chunks',
      headers,
      chunks: [
        `data:  {"id":"6e2cd91750904b7092f49bdca9083de1","object":"chat.completion.chunk",` +
          `"created":1711097175,"model":"mistral-small-latest","choices":[{"index":0,` +
          `"delta":{"role":"assistant","content":""},"finish_reason":null,"logprobs":null}]}\n\n`,
        ...content.map(text => {
          return (
            `data:  {"id":"6e2cd91750904b7092f49bdca9083de1","object":"chat.completion.chunk",` +
            `"created":1711097175,"model":"mistral-small-latest","choices":[{"index":0,` +
            `"delta":{"role":"assistant","content":"${text}"},"finish_reason":null,"logprobs":null}]}\n\n`
          );
        }),
        `data:  {"id":"6e2cd91750904b7092f49bdca9083de1","object":"chat.completion.chunk",` +
          `"created":1711097175,"model":"mistral-small-latest","choices":[{"index":0,` +
          `"delta":{"content":""},"finish_reason":"stop","logprobs":null}],` +
          `"usage":{"prompt_tokens":4,"total_tokens":36,"completion_tokens":32}}\n\n`,
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
          "id": "6e2cd91750904b7092f49bdca9083de1",
          "modelId": "mistral-small-latest",
          "timestamp": 2024-03-22T08:46:15.000Z,
          "type": "response-metadata",
        },
        {
          "text": "",
          "type": "text",
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
          "text": "",
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
      includeRawChunks: false,
    });

    expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
      [
        {
          "type": "stream-start",
          "warnings": [],
        },
        {
          "id": "6e2cd91750904b7092f49bdca9083de1",
          "modelId": "mistral-small-latest",
          "timestamp": 2024-03-22T08:46:15.000Z,
          "type": "response-metadata",
        },
        {
          "text": "",
          "type": "text",
        },
        {
          "text": "and",
          "type": "text",
        },
        {
          "text": " more content",
          "type": "text",
        },
        {
          "text": "",
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
    server.urls['https://api.mistral.ai/v1/chat/completions'].response = {
      type: 'stream-chunks',
      chunks: [
        `data: {"id":"ad6f7ce6543c4d0890280ae184fe4dd8","object":"chat.completion.chunk","created":1711365023,"model":"mistral-large-latest",` +
          `"choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null,"logprobs":null}]}\n\n`,
        `data: {"id":"ad6f7ce6543c4d0890280ae184fe4dd8","object":"chat.completion.chunk","created":1711365023,"model":"mistral-large-latest",` +
          `"choices":[{"index":0,"delta":{"content":null,"tool_calls":[{"id":"yfBEybNYi","function":{"name":"test-tool","arguments":` +
          `"{\\"value\\":\\"Sparkle Day\\"}"` +
          `}}]},"finish_reason":"tool_calls","logprobs":null}],"usage":{"prompt_tokens":183,"total_tokens":316,"completion_tokens":133}}\n\n`,
        'data: [DONE]\n\n',
      ],
    };

    const { stream } = await createMistral({
      apiKey: 'test-api-key',
    })
      .chat('mistral-large-latest')
      .doStream({
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
        includeRawChunks: false,
      });

    expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
      [
        {
          "type": "stream-start",
          "warnings": [],
        },
        {
          "id": "ad6f7ce6543c4d0890280ae184fe4dd8",
          "modelId": "mistral-large-latest",
          "timestamp": 2024-03-25T11:10:23.000Z,
          "type": "response-metadata",
        },
        {
          "text": "",
          "type": "text",
        },
        {
          "argsTextDelta": "{"value":"Sparkle Day"}",
          "toolCallId": "yfBEybNYi",
          "toolCallType": "function",
          "toolName": "test-tool",
          "type": "tool-call-delta",
        },
        {
          "args": "{"value":"Sparkle Day"}",
          "toolCallId": "yfBEybNYi",
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
      model: 'mistral-small-latest',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
    });
  });

  it('should pass headers', async () => {
    prepareStreamResponse({ content: [] });

    const provider = createMistral({
      apiKey: 'test-api-key',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await provider.chat('mistral-small-latest').doStream({
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
          "document_image_limit": undefined,
          "document_page_limit": undefined,
          "max_tokens": undefined,
          "messages": [
            {
              "content": [
                {
                  "text": "Hello",
                  "type": "text",
                },
              ],
              "role": "user",
            },
          ],
          "model": "mistral-small-latest",
          "random_seed": undefined,
          "response_format": undefined,
          "safe_prompt": undefined,
          "stream": true,
          "temperature": undefined,
          "tool_choice": undefined,
          "tools": undefined,
          "top_p": undefined,
        },
      }
    `);
  });

  it('should stream text with content objects', async () => {
    // Instead of using prepareStreamResponse (which sends strings),
    // we set the chunks manually so that each delta's content is an object.
    server.urls['https://api.mistral.ai/v1/chat/completions'].response = {
      type: 'stream-chunks',
      chunks: [
        `data: {"id":"stream-object-id","object":"chat.completion.chunk","created":1711097175,"model":"mistral-small-latest","choices":[{"index":0,"delta":{"role":"assistant","content":[{"type":"text","text":""}]},"finish_reason":null,"logprobs":null}]}\n\n`,
        `data: {"id":"stream-object-id","object":"chat.completion.chunk","created":1711097175,"model":"mistral-small-latest","choices":[{"index":0,"delta":{"content":[{"type":"text","text":"Hello"}]},"finish_reason":null,"logprobs":null}]}\n\n`,
        `data: {"id":"stream-object-id","object":"chat.completion.chunk","created":1711097175,"model":"mistral-small-latest","choices":[{"index":0,"delta":{"content":[{"type":"text","text":", world!"}]},"finish_reason":"stop","logprobs":null}],"usage":{"prompt_tokens":4,"total_tokens":36,"completion_tokens":32}}\n\n`,
        `data: [DONE]\n\n`,
      ],
    };

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
          "id": "stream-object-id",
          "modelId": "mistral-small-latest",
          "timestamp": 2024-03-22T08:46:15.000Z,
          "type": "response-metadata",
        },
        {
          "text": "",
          "type": "text",
        },
        {
          "text": "Hello",
          "type": "text",
        },
        {
          "text": ", world!",
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
});

describe('doStream with raw chunks', () => {
  it('should stream raw chunks when includeRawChunks is true', async () => {
    server.urls['https://api.mistral.ai/v1/chat/completions'].response = {
      type: 'stream-chunks',
      chunks: [
        `data: {"id":"cmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"mistral-large-latest","choices":[{"index":0,"delta":{"role":"assistant","content":"Hello"},"finish_reason":null}]}\n\n`,
        `data: {"id":"cmpl-456","object":"chat.completion.chunk","created":1234567890,"model":"mistral-large-latest","choices":[{"index":0,"delta":{"content":" world"},"finish_reason":null}]}\n\n`,
        `data: {"id":"cmpl-789","object":"chat.completion.chunk","created":1234567890,"model":"mistral-large-latest","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\n`,
        'data: [DONE]\n\n',
      ],
    };

    const { stream } = await model.doStream({
      prompt: TEST_PROMPT,
      includeRawChunks: true,
    });

    expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
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
            "created": 1234567890,
            "id": "cmpl-123",
            "model": "mistral-large-latest",
            "object": "chat.completion.chunk",
          },
          "type": "raw",
        },
        {
          "id": "cmpl-123",
          "modelId": "mistral-large-latest",
          "timestamp": 2009-02-13T23:31:30.000Z,
          "type": "response-metadata",
        },
        {
          "text": "Hello",
          "type": "text",
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
            "created": 1234567890,
            "id": "cmpl-456",
            "model": "mistral-large-latest",
            "object": "chat.completion.chunk",
          },
          "type": "raw",
        },
        {
          "text": " world",
          "type": "text",
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
            "created": 1234567890,
            "id": "cmpl-789",
            "model": "mistral-large-latest",
            "object": "chat.completion.chunk",
            "usage": {
              "completion_tokens": 5,
              "prompt_tokens": 10,
              "total_tokens": 15,
            },
          },
          "type": "raw",
        },
        {
          "finishReason": "stop",
          "type": "finish",
          "usage": {
            "inputTokens": 10,
            "outputTokens": 5,
            "totalTokens": 15,
          },
        },
      ]
    `);
  });
});
