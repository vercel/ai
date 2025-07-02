import { LanguageModelV2Prompt } from '@ai-sdk/provider';
import {
  convertReadableStreamToArray,
  createTestServer,
  isNodeVersion,
} from '@ai-sdk/provider-utils/test';
import { OpenAICompatibleChatLanguageModel } from './openai-compatible-chat-language-model';
import { createOpenAICompatible } from './openai-compatible-provider';

const TEST_PROMPT: LanguageModelV2Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const provider = createOpenAICompatible({
  baseURL: 'https://my.api.com/v1/',
  name: 'test-provider',
  headers: {
    Authorization: `Bearer test-api-key`,
  },
});

const model = provider.completionModel('gpt-3.5-turbo-instruct');

const server = createTestServer({
  'https://my.api.com/v1/completions': {},
});

describe('config', () => {
  it('should extract base name from provider string', () => {
    const model = new OpenAICompatibleChatLanguageModel('gpt-4', {
      provider: 'anthropic.beta',
      url: () => '',
      headers: () => ({}),
    });

    expect(model['providerOptionsName']).toBe('anthropic');
  });

  it('should handle provider without dot notation', () => {
    const model = new OpenAICompatibleChatLanguageModel('gpt-4', {
      provider: 'openai',
      url: () => '',
      headers: () => ({}),
    });

    expect(model['providerOptionsName']).toBe('openai');
  });

  it('should return empty for empty provider', () => {
    const model = new OpenAICompatibleChatLanguageModel(
      'gpt-4',

      {
        provider: '',
        url: () => '',
        headers: () => ({}),
      },
    );

    expect(model['providerOptionsName']).toBe('');
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
    finish_reason = 'stop',
    id = 'cmpl-96cAM1v77r4jXa4qb2NSmRREV5oWB',
    created = 1711363706,
    model = 'gpt-3.5-turbo-instruct',
    headers,
  }: {
    content?: string;
    usage?: {
      prompt_tokens: number;
      total_tokens: number;
      completion_tokens: number;
    };
    finish_reason?: string;
    id?: string;
    created?: number;
    model?: string;
    headers?: Record<string, string>;
  }) {
    server.urls['https://my.api.com/v1/completions'].response = {
      type: 'json-value',
      headers,
      body: {
        id,
        object: 'text_completion',
        created,
        model,
        choices: [
          {
            text: content,
            index: 0,
            finish_reason,
          },
        ],
        usage,
      },
    };
  }

  it('should extract text response', async () => {
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
  it('should send request body', async () => {
    prepareJsonResponse({});

    const { request } = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(request).toMatchInlineSnapshot(`
      {
        "body": {
          "echo": undefined,
          "frequency_penalty": undefined,
          "logit_bias": undefined,
          "max_tokens": undefined,
          "model": "gpt-3.5-turbo-instruct",
          "presence_penalty": undefined,
          "prompt": "user:
      Hello

      assistant:
      ",
          "seed": undefined,
          "stop": [
            "
      user:",
          ],
          "suffix": undefined,
          "temperature": undefined,
          "top_p": undefined,
          "user": undefined,
        },
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

    expect(response).toMatchInlineSnapshot(`
      {
        "body": {
          "choices": [
            {
              "finish_reason": "stop",
              "index": 0,
              "text": "",
            },
          ],
          "created": 123,
          "id": "test-id",
          "model": "test-model",
          "object": "text_completion",
          "usage": {
            "completion_tokens": 30,
            "prompt_tokens": 4,
            "total_tokens": 34,
          },
        },
        "headers": {
          "content-length": "204",
          "content-type": "application/json",
        },
        "id": "test-id",
        "modelId": "test-model",
        "timestamp": 1970-01-01T00:02:03.000Z,
      }
    `);
  });

  it('should extract finish reason', async () => {
    prepareJsonResponse({
      finish_reason: 'stop',
    });

    const { finishReason } = await provider
      .completionModel('gpt-3.5-turbo-instruct')
      .doGenerate({
        prompt: TEST_PROMPT,
      });

    expect(finishReason).toStrictEqual('stop');
  });

  it('should support unknown finish reason', async () => {
    prepareJsonResponse({
      finish_reason: 'eos',
    });

    const { finishReason } = await provider
      .completionModel('gpt-3.5-turbo-instruct')
      .doGenerate({
        prompt: TEST_PROMPT,
      });

    expect(finishReason).toStrictEqual('unknown');
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
      'content-length': '250',
      'content-type': 'application/json',

      // custom header
      'test-header': 'test-value',
    });
  });

  it('should pass the model and the prompt', async () => {
    prepareJsonResponse({ content: '' });

    await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
      {
        "model": "gpt-3.5-turbo-instruct",
        "prompt": "user:
      Hello

      assistant:
      ",
        "stop": [
          "
      user:",
        ],
      }
    `);
  });

  it('should pass headers', async () => {
    prepareJsonResponse({ content: '' });

    const provider = createOpenAICompatible({
      baseURL: 'https://my.api.com/v1/',
      name: 'test-provider',
      headers: {
        Authorization: `Bearer test-api-key`,
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await provider.completionModel('gpt-3.5-turbo-instruct').doGenerate({
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

  it('should include provider-specific options', async () => {
    prepareJsonResponse({ content: '' });

    await provider.completionModel('gpt-3.5-turbo-instruct').doGenerate({
      prompt: TEST_PROMPT,
      providerOptions: {
        'test-provider': {
          someCustomOption: 'test-value',
        },
      },
    });

    expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
      {
        "model": "gpt-3.5-turbo-instruct",
        "prompt": "user:
      Hello

      assistant:
      ",
        "someCustomOption": "test-value",
        "stop": [
          "
      user:",
        ],
      }
    `);
  });

  it('should not include provider-specific options for different provider', async () => {
    prepareJsonResponse({ content: '' });

    await provider.completionModel('gpt-3.5-turbo-instruct').doGenerate({
      prompt: TEST_PROMPT,
      providerOptions: {
        notThisProviderName: {
          someCustomOption: 'test-value',
        },
      },
    });

    expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
      {
        "model": "gpt-3.5-turbo-instruct",
        "prompt": "user:
      Hello

      assistant:
      ",
        "stop": [
          "
      user:",
        ],
      }
    `);
  });
});

describe('doStream', () => {
  function prepareEmptyStreamResponse(headers?: Record<string, string>) {
    server.urls['https://my.api.com/v1/completions'].response = {
      type: 'stream-chunks',
      headers,
      chunks: [
        `data: {"id":"cmpl-96c3yLQE1TtZCd6n6OILVmzev8M8H","object":"text_completion","created":1711363310,"model":"gpt-3.5-turbo-instruct","choices":[{"text":"","index":0,"logprobs":null,"finish_reason":"stop"}]}\n\n`,
        `data: {"id":"cmpl-96c3yLQE1TtZCd6n6OILVmzev8M8H","object":"text_completion","created":1711363310,"model":"gpt-3.5-turbo-instruct","usage":{"prompt_tokens":10,"completion_tokens":0,"total_tokens":10},"choices":[]}\n\n`,
        'data: [DONE]\n\n',
      ],
    };
  }

  it('should stream text deltas', async () => {
    server.urls['https://my.api.com/v1/completions'].response = {
      type: 'stream-chunks',
      chunks: [
        `data: {"id":"cmpl-96c64EdfhOw8pjFFgVpLuT8k2MtdT","object":"text_completion","created":1711363440,"model":"gpt-3.5-turbo-instruct","choices":[{"text":"Hello","index":0,"logprobs":null,"finish_reason":null}]}\n\n`,
        `data: {"id":"cmpl-96c64EdfhOw8pjFFgVpLuT8k2MtdT","object":"text_completion","created":1711363440,"model":"gpt-3.5-turbo-instruct","choices":[{"text":",","index":0,"logprobs":null,"finish_reason":null}]}\n\n`,
        `data: {"id":"cmpl-96c64EdfhOw8pjFFgVpLuT8k2MtdT","object":"text_completion","created":1711363440,"model":"gpt-3.5-turbo-instruct","choices":[{"text":" World!","index":0,"logprobs":null,"finish_reason":null}]}\n\n`,
        `data: {"id":"cmpl-96c3yLQE1TtZCd6n6OILVmzev8M8H","object":"text_completion","created":1711363310,"model":"gpt-3.5-turbo-instruct","choices":[{"text":"","index":0,"logprobs":null,"finish_reason":"stop"}]}\n\n`,
        `data: {"id":"cmpl-96c3yLQE1TtZCd6n6OILVmzev8M8H","object":"text_completion","created":1711363310,"model":"gpt-3.5-turbo-instruct","usage":{"prompt_tokens":10,"completion_tokens":362,"total_tokens":372},"choices":[]}\n\n`,
        'data: [DONE]\n\n',
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
          "id": "cmpl-96c64EdfhOw8pjFFgVpLuT8k2MtdT",
          "modelId": "gpt-3.5-turbo-instruct",
          "timestamp": 2024-03-25T10:44:00.000Z,
          "type": "response-metadata",
        },
        {
          "id": "0",
          "type": "text-start",
        },
        {
          "delta": "Hello",
          "id": "0",
          "type": "text-delta",
        },
        {
          "delta": ",",
          "id": "0",
          "type": "text-delta",
        },
        {
          "delta": " World!",
          "id": "0",
          "type": "text-delta",
        },
        {
          "delta": "",
          "id": "0",
          "type": "text-delta",
        },
        {
          "id": "0",
          "type": "text-end",
        },
        {
          "finishReason": "stop",
          "type": "finish",
          "usage": {
            "inputTokens": 10,
            "outputTokens": 362,
            "totalTokens": 372,
          },
        },
      ]
    `);
  });

  it('should handle error stream parts', async () => {
    server.urls['https://my.api.com/v1/completions'].response = {
      type: 'stream-chunks',
      chunks: [
        `data: {"error":{"message":"The server had an error processing your request. Sorry about that! You can retry your request, or contact us through our help center at help.openai.com if you keep seeing this error.","type":"server_error","param":null,"code":null}}\n\n`,
        'data: [DONE]\n\n',
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
          "error": {
            "code": null,
            "message": "The server had an error processing your request. Sorry about that! You can retry your request, or contact us through our help center at help.openai.com if you keep seeing this error.",
            "param": null,
            "type": "server_error",
          },
          "type": "error",
        },
        {
          "finishReason": "error",
          "type": "finish",
          "usage": {
            "inputTokens": undefined,
            "outputTokens": undefined,
            "totalTokens": undefined,
          },
        },
      ]
    `);
  });

  it.skipIf(isNodeVersion(20))(
    'should handle unparsable stream parts',
    async () => {
      server.urls['https://my.api.com/v1/completions'].response = {
        type: 'stream-chunks',
        chunks: [`data: {unparsable}\n\n`, 'data: [DONE]\n\n'],
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
            "error": [AI_JSONParseError: JSON parsing failed: Text: {unparsable}.
        Error message: Expected property name or '}' in JSON at position 1 (line 1 column 2)],
            "type": "error",
          },
          {
            "finishReason": "error",
            "type": "finish",
            "usage": {
              "inputTokens": undefined,
              "outputTokens": undefined,
              "totalTokens": undefined,
            },
          },
        ]
      `);
    },
  );

  it('should send request body', async () => {
    prepareEmptyStreamResponse();

    const { request } = await model.doStream({
      prompt: TEST_PROMPT,
      includeRawChunks: false,
    });

    expect(request).toMatchInlineSnapshot(`
      {
        "body": {
          "echo": undefined,
          "frequency_penalty": undefined,
          "logit_bias": undefined,
          "max_tokens": undefined,
          "model": "gpt-3.5-turbo-instruct",
          "presence_penalty": undefined,
          "prompt": "user:
      Hello

      assistant:
      ",
          "seed": undefined,
          "stop": [
            "
      user:",
          ],
          "stream": true,
          "stream_options": undefined,
          "suffix": undefined,
          "temperature": undefined,
          "top_p": undefined,
          "user": undefined,
        },
      }
    `);
  });

  it('should expose the raw response headers', async () => {
    prepareEmptyStreamResponse({ 'test-header': 'test-value' });

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

  it('should pass the model and the prompt', async () => {
    prepareEmptyStreamResponse();

    await model.doStream({
      prompt: TEST_PROMPT,
      includeRawChunks: false,
    });

    expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
      {
        "model": "gpt-3.5-turbo-instruct",
        "prompt": "user:
      Hello

      assistant:
      ",
        "stop": [
          "
      user:",
        ],
        "stream": true,
      }
    `);
  });

  it('should pass headers', async () => {
    prepareEmptyStreamResponse();

    const provider = createOpenAICompatible({
      baseURL: 'https://my.api.com/v1/',
      name: 'test-provider',
      headers: {
        Authorization: `Bearer test-api-key`,
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await provider.completionModel('gpt-3.5-turbo-instruct').doStream({
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

  it('should include provider-specific options', async () => {
    prepareEmptyStreamResponse();

    await model.doStream({
      providerOptions: {
        'test-provider': {
          someCustomOption: 'test-value',
        },
      },
      prompt: TEST_PROMPT,
      includeRawChunks: false,
    });

    expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
      {
        "model": "gpt-3.5-turbo-instruct",
        "prompt": "user:
      Hello

      assistant:
      ",
        "someCustomOption": "test-value",
        "stop": [
          "
      user:",
        ],
        "stream": true,
      }
    `);
  });

  it('should not include provider-specific options for different provider', async () => {
    prepareEmptyStreamResponse();

    await model.doStream({
      providerOptions: {
        notThisProviderName: {
          someCustomOption: 'test-value',
        },
      },
      prompt: TEST_PROMPT,
      includeRawChunks: false,
    });

    expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
      {
        "model": "gpt-3.5-turbo-instruct",
        "prompt": "user:
      Hello

      assistant:
      ",
        "stop": [
          "
      user:",
        ],
        "stream": true,
      }
    `);
  });
});
