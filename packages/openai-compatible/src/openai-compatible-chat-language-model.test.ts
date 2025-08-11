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

const model = provider('grok-beta');

const server = createTestServer({
  'https://my.api.com/v1/chat/completions': {},
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
    const model = new OpenAICompatibleChatLanguageModel('gpt-4', {
      provider: '',
      url: () => '',
      headers: () => ({}),
    });

    expect(model['providerOptionsName']).toBe('');
  });
});

describe('doGenerate', () => {
  function prepareJsonResponse({
    content = '',
    reasoning_content = '',
    reasoning = '',
    tool_calls,
    function_call,
    usage = {
      prompt_tokens: 4,
      total_tokens: 34,
      completion_tokens: 30,
    },
    finish_reason = 'stop',
    id = 'chatcmpl-95ZTZkhr0mHNKqerQfiwkuox3PHAd',
    created = 1711115037,
    model = 'grok-beta',
    headers,
  }: {
    content?: string;
    reasoning_content?: string;
    reasoning?: string;
    tool_calls?: Array<{
      id: string;
      type: 'function';
      function: {
        name: string;
        arguments: string;
      };
    }>;
    function_call?: {
      name: string;
      arguments: string;
    };
    usage?: {
      prompt_tokens?: number;
      total_tokens?: number;
      completion_tokens?: number;
      prompt_tokens_details?: {
        cached_tokens?: number;
      };
      completion_tokens_details?: {
        reasoning_tokens?: number;
        accepted_prediction_tokens?: number;
        rejected_prediction_tokens?: number;
      };
    };
    finish_reason?: string;
    created?: number;
    id?: string;
    model?: string;
    headers?: Record<string, string>;
  } = {}) {
    server.urls['https://my.api.com/v1/chat/completions'].response = {
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
              reasoning_content,
              reasoning,
              tool_calls,
              function_call,
            },
            finish_reason,
          },
        ],
        usage,
        system_fingerprint: 'fp_3bc1b5746c',
      },
    };
  }

  it('should pass user setting to requests', async () => {
    prepareJsonResponse({ content: 'Hello, World!' });
    const modelWithUser = provider('grok-beta');
    await modelWithUser.doGenerate({
      prompt: TEST_PROMPT,
      providerOptions: {
        xai: {
          user: 'test-user-id',
        },
      },
    });
    expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
      {
        "messages": [
          {
            "content": "Hello",
            "role": "user",
          },
        ],
        "model": "grok-beta",
      }
    `);
  });

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

  it('should extract reasoning content', async () => {
    prepareJsonResponse({
      content: 'Hello, World!',
      reasoning_content: 'This is the reasoning behind the response',
    });

    const { content } = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(content).toMatchInlineSnapshot(`
      [
        {
          "text": "Hello, World!",
          "type": "text",
        },
        {
          "text": "This is the reasoning behind the response",
          "type": "reasoning",
        },
      ]
    `);
  });

  it('should extract reasoning from reasoning field when reasoning_content is not provided', async () => {
    prepareJsonResponse({
      content: 'Hello, World!',
      reasoning: 'This is the reasoning from the reasoning field',
    });

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

  it('should prefer reasoning_content over reasoning field when both are provided', async () => {
    prepareJsonResponse({
      content: 'Hello, World!',
      reasoning_content: 'This is from reasoning_content',
      reasoning: 'This is from reasoning field',
    });

    const { content } = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(content).toMatchInlineSnapshot(`
      [
        {
          "text": "Hello, World!",
          "type": "text",
        },
        {
          "text": "This is from reasoning_content",
          "type": "reasoning",
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
        "cachedInputTokens": undefined,
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

    expect(response).toMatchInlineSnapshot(`
      {
        "body": {
          "choices": [
            {
              "finish_reason": "stop",
              "index": 0,
              "message": {
                "content": "",
                "reasoning": "",
                "reasoning_content": "",
                "role": "assistant",
              },
            },
          ],
          "created": 123,
          "id": "test-id",
          "model": "test-model",
          "object": "chat.completion",
          "system_fingerprint": "fp_3bc1b5746c",
          "usage": {
            "completion_tokens": 30,
            "prompt_tokens": 4,
            "total_tokens": 34,
          },
        },
        "headers": {
          "content-length": "313",
          "content-type": "application/json",
        },
        "id": "test-id",
        "modelId": "test-model",
        "timestamp": 1970-01-01T00:02:03.000Z,
      }
    `);
  });

  it('should support partial usage', async () => {
    prepareJsonResponse({
      usage: { prompt_tokens: 20, total_tokens: 20 },
    });

    const { usage } = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(usage).toMatchInlineSnapshot(`
      {
        "cachedInputTokens": undefined,
        "inputTokens": 20,
        "outputTokens": undefined,
        "reasoningTokens": undefined,
        "totalTokens": 20,
      }
    `);
  });

  it('should extract finish reason', async () => {
    prepareJsonResponse({
      finish_reason: 'stop',
    });

    const response = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(response.finishReason).toStrictEqual('stop');
  });

  it('should support unknown finish reason', async () => {
    prepareJsonResponse({
      finish_reason: 'eos',
    });

    const response = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(response.finishReason).toStrictEqual('unknown');
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
      'content-length': '350',
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

  it('should pass settings', async () => {
    prepareJsonResponse();

    await provider('grok-beta').doGenerate({
      prompt: TEST_PROMPT,
      providerOptions: {
        'openai-compatible': {
          user: 'test-user-id',
        },
      },
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      model: 'grok-beta',
      messages: [{ role: 'user', content: 'Hello' }],
      user: 'test-user-id',
    });
  });

  it('should include provider-specific options', async () => {
    prepareJsonResponse();

    await provider('grok-beta').doGenerate({
      providerOptions: {
        'test-provider': {
          someCustomOption: 'test-value',
        },
      },
      prompt: TEST_PROMPT,
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      model: 'grok-beta',
      messages: [{ role: 'user', content: 'Hello' }],
      someCustomOption: 'test-value',
    });
  });

  it('should not include provider-specific options for different provider', async () => {
    prepareJsonResponse();

    await provider('grok-beta').doGenerate({
      providerOptions: {
        notThisProviderName: {
          someCustomOption: 'test-value',
        },
      },
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

    const provider = createOpenAICompatible({
      baseURL: 'https://my.api.com/v1/',
      name: 'test-provider',
      headers: {
        Authorization: `Bearer test-api-key`,
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await provider('grok-beta').doGenerate({
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

  it('should parse tool results', async () => {
    prepareJsonResponse({
      tool_calls: [
        {
          id: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
          type: 'function',
          function: {
            name: 'test-tool',
            arguments: '{"value":"Spark"}',
          },
        },
      ],
    });

    const result = await model.doGenerate({
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

    expect(result.content).toMatchInlineSnapshot(`
      [
        {
          "input": "{"value":"Spark"}",
          "toolCallId": "call_O17Uplv4lJvD6DVdIvFFeRMw",
          "toolName": "test-tool",
          "type": "tool-call",
        },
      ]
    `);
  });

  describe('response format', () => {
    it('should not send a response_format when response format is text', async () => {
      prepareJsonResponse({ content: '{"value":"Spark"}' });

      const model = new OpenAICompatibleChatLanguageModel('gpt-4o-2024-08-06', {
        provider: 'test-provider',
        url: () => 'https://my.api.com/v1/chat/completions',
        headers: () => ({}),
        supportsStructuredOutputs: false,
      });

      await model.doGenerate({
        prompt: TEST_PROMPT,
        responseFormat: { type: 'text' },
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'gpt-4o-2024-08-06',
        messages: [{ role: 'user', content: 'Hello' }],
      });
    });

    it('should forward json response format as "json_object" without schema', async () => {
      prepareJsonResponse({ content: '{"value":"Spark"}' });

      const model = provider('gpt-4o-2024-08-06');

      await model.doGenerate({
        prompt: TEST_PROMPT,
        responseFormat: { type: 'json' },
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'gpt-4o-2024-08-06',
        messages: [{ role: 'user', content: 'Hello' }],
        response_format: { type: 'json_object' },
      });
    });

    it('should forward json response format as "json_object" and omit schema when structuredOutputs are disabled', async () => {
      prepareJsonResponse({ content: '{"value":"Spark"}' });

      const model = new OpenAICompatibleChatLanguageModel('gpt-4o-2024-08-06', {
        provider: 'test-provider',
        url: () => 'https://my.api.com/v1/chat/completions',
        headers: () => ({}),
        supportsStructuredOutputs: false,
      });

      const { warnings } = await model.doGenerate({
        prompt: TEST_PROMPT,
        responseFormat: {
          type: 'json',
          schema: {
            type: 'object',
            properties: { value: { type: 'string' } },
            required: ['value'],
            additionalProperties: false,
            $schema: 'http://json-schema.org/draft-07/schema#',
          },
        },
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'gpt-4o-2024-08-06',
        messages: [{ role: 'user', content: 'Hello' }],
        response_format: { type: 'json_object' },
      });

      expect(warnings).toEqual([
        {
          details:
            'JSON response format schema is only supported with structuredOutputs',
          setting: 'responseFormat',
          type: 'unsupported-setting',
        },
      ]);
    });

    it('should forward json response format as "json_object" and include schema when structuredOutputs are enabled', async () => {
      prepareJsonResponse({ content: '{"value":"Spark"}' });

      const model = new OpenAICompatibleChatLanguageModel('gpt-4o-2024-08-06', {
        provider: 'test-provider',
        url: () => 'https://my.api.com/v1/chat/completions',
        headers: () => ({}),
        supportsStructuredOutputs: true,
      });

      const { warnings } = await model.doGenerate({
        prompt: TEST_PROMPT,
        responseFormat: {
          type: 'json',
          schema: {
            type: 'object',
            properties: { value: { type: 'string' } },
            required: ['value'],
            additionalProperties: false,
            $schema: 'http://json-schema.org/draft-07/schema#',
          },
        },
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'gpt-4o-2024-08-06',
        messages: [{ role: 'user', content: 'Hello' }],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'response',
            schema: {
              type: 'object',
              properties: { value: { type: 'string' } },
              required: ['value'],
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
        },
      });

      expect(warnings).toEqual([]);
    });

    it('should respect the reasoningEffort provider option', async () => {
      prepareJsonResponse({ content: '{"value":"test"}' });

      const model = new OpenAICompatibleChatLanguageModel('gpt-4o-2024-08-06', {
        provider: 'test-provider',
        url: () => 'https://my.api.com/v1/chat/completions',
        headers: () => ({}),
      });

      await model.doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: {
          'openai-compatible': {
            reasoningEffort: 'low',
          },
        },
      });

      const body = await server.calls[0].requestBodyJson;

      expect(body.reasoning_effort).toBe('low');
    });

    it('should use json_schema & strict with responseFormat json when structuredOutputs are enabled', async () => {
      prepareJsonResponse({ content: '{"value":"Spark"}' });

      const model = new OpenAICompatibleChatLanguageModel('gpt-4o-2024-08-06', {
        provider: 'test-provider',
        url: () => 'https://my.api.com/v1/chat/completions',
        headers: () => ({}),
        supportsStructuredOutputs: true,
      });

      await model.doGenerate({
        responseFormat: {
          type: 'json',
          schema: {
            type: 'object',
            properties: { value: { type: 'string' } },
            required: ['value'],
            additionalProperties: false,
            $schema: 'http://json-schema.org/draft-07/schema#',
          },
        },
        prompt: TEST_PROMPT,
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'gpt-4o-2024-08-06',
        messages: [{ role: 'user', content: 'Hello' }],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'response',
            schema: {
              type: 'object',
              properties: { value: { type: 'string' } },
              required: ['value'],
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
        },
      });
    });

    it('should set name & description with responseFormat json when structuredOutputs are enabled', async () => {
      prepareJsonResponse({ content: '{"value":"Spark"}' });

      const model = new OpenAICompatibleChatLanguageModel('gpt-4o-2024-08-06', {
        provider: 'test-provider',
        url: () => 'https://my.api.com/v1/chat/completions',
        headers: () => ({}),
        supportsStructuredOutputs: true,
      });

      await model.doGenerate({
        responseFormat: {
          type: 'json',
          name: 'test-name',
          description: 'test description',
          schema: {
            type: 'object',
            properties: { value: { type: 'string' } },
            required: ['value'],
            additionalProperties: false,
            $schema: 'http://json-schema.org/draft-07/schema#',
          },
        },
        prompt: TEST_PROMPT,
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'gpt-4o-2024-08-06',
        messages: [{ role: 'user', content: 'Hello' }],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'test-name',
            description: 'test description',
            schema: {
              type: 'object',
              properties: { value: { type: 'string' } },
              required: ['value'],
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
        },
      });
    });

    it('should allow for undefined schema with responseFormat json when structuredOutputs are enabled', async () => {
      prepareJsonResponse({ content: '{"value":"Spark"}' });

      const model = new OpenAICompatibleChatLanguageModel('gpt-4o-2024-08-06', {
        provider: 'test-provider',
        url: () => 'https://my.api.com/v1/chat/completions',
        headers: () => ({}),
        supportsStructuredOutputs: true,
      });

      await model.doGenerate({
        responseFormat: {
          type: 'json',
          name: 'test-name',
          description: 'test description',
        },
        prompt: TEST_PROMPT,
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'gpt-4o-2024-08-06',
        messages: [{ role: 'user', content: 'Hello' }],
        response_format: {
          type: 'json_object',
        },
      });
    });
  });

  it('should send request body', async () => {
    prepareJsonResponse({ content: '' });

    const { request } = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(request).toStrictEqual({
      body: '{"model":"grok-beta","messages":[{"role":"user","content":"Hello"}]}',
    });
  });

  describe('usage details', () => {
    it('should extract detailed token usage when available', async () => {
      prepareJsonResponse({
        usage: {
          prompt_tokens: 20,
          completion_tokens: 30,
          total_tokens: 50,
          prompt_tokens_details: {
            cached_tokens: 5,
          },
          completion_tokens_details: {
            reasoning_tokens: 10,
            accepted_prediction_tokens: 15,
            rejected_prediction_tokens: 5,
          },
        },
      });

      const result = await model.doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(result.usage).toMatchInlineSnapshot(`
        {
          "cachedInputTokens": 5,
          "inputTokens": 20,
          "outputTokens": 30,
          "reasoningTokens": 10,
          "totalTokens": 50,
        }
      `);
      expect(result.providerMetadata).toMatchInlineSnapshot(`
        {
          "test-provider": {
            "acceptedPredictionTokens": 15,
            "rejectedPredictionTokens": 5,
          },
        }
      `);
    });

    it('should handle missing token details', async () => {
      prepareJsonResponse({
        usage: {
          prompt_tokens: 20,
          completion_tokens: 30,
          // No token details provided
        },
      });

      const result = await model.doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(result.providerMetadata!['test-provider']).toStrictEqual({});
    });

    it('should handle partial token details', async () => {
      prepareJsonResponse({
        usage: {
          prompt_tokens: 20,
          completion_tokens: 30,
          total_tokens: 50,
          prompt_tokens_details: {
            cached_tokens: 5,
          },
          completion_tokens_details: {
            // Only reasoning tokens provided
            reasoning_tokens: 10,
          },
        },
      });

      const result = await model.doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(result.usage).toMatchInlineSnapshot(`
        {
          "cachedInputTokens": 5,
          "inputTokens": 20,
          "outputTokens": 30,
          "reasoningTokens": 10,
          "totalTokens": 50,
        }
      `);
    });
  });
});

describe('doStream', () => {
  function prepareStreamResponse({
    content = [],
    finish_reason = 'stop',
    headers,
  }: {
    content?: string[];
    finish_reason?: string;
    headers?: Record<string, string>;
  }) {
    server.urls['https://my.api.com/v1/chat/completions'].response = {
      type: 'stream-chunks',
      headers,
      chunks: [
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1702657020,"model":"grok-beta",` +
          `"system_fingerprint":null,"choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}\n\n`,
        ...content.map(text => {
          return (
            `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1702657020,"model":"grok-beta",` +
            `"system_fingerprint":null,"choices":[{"index":1,"delta":{"content":"${text}"},"finish_reason":null}]}\n\n`
          );
        }),
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1702657020,"model":"grok-beta",` +
          `"system_fingerprint":null,"choices":[{"index":0,"delta":{},"finish_reason":"${finish_reason}"}]}\n\n`,
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1729171479,"model":"grok-beta",` +
          `"system_fingerprint":"fp_10c08bf97d","choices":[{"index":0,"delta":{},"finish_reason":"${finish_reason}"}],` +
          `"usage":{"queue_time":0.061348671,"prompt_tokens":18,"prompt_time":0.000211569,` +
          `"completion_tokens":439,"completion_time":0.798181818,"total_tokens":457,"total_time":0.798393387}}\n\n`,
        'data: [DONE]\n\n',
      ],
    };
  }

  it('should respect the includeUsage option', async () => {
    prepareStreamResponse({
      content: ['Hello', ', ', 'World!'],
      finish_reason: 'stop',
    });

    const model = new OpenAICompatibleChatLanguageModel('gpt-4o-2024-08-06', {
      provider: 'test-provider',
      url: () => 'https://my.api.com/v1/chat/completions',
      headers: () => ({}),
      includeUsage: true,
    });

    await model.doStream({
      prompt: TEST_PROMPT,
      includeRawChunks: false,
    });

    const body = await server.calls[0].requestBodyJson;

    expect(body.stream).toBe(true);
    expect(body.stream_options).toStrictEqual({ include_usage: true });
  });

  it('should stream text deltas', async () => {
    prepareStreamResponse({
      content: ['Hello', ', ', 'World!'],
      finish_reason: 'stop',
    });

    const { stream } = await model.doStream({
      prompt: TEST_PROMPT,
      includeRawChunks: false,
    });

    // note: space moved to last chunk bc of trimming
    expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
      [
        {
          "type": "stream-start",
          "warnings": [],
        },
        {
          "id": "chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798",
          "modelId": "grok-beta",
          "timestamp": 2023-12-15T16:17:00.000Z,
          "type": "response-metadata",
        },
        {
          "id": "txt-0",
          "type": "text-start",
        },
        {
          "delta": "Hello",
          "id": "txt-0",
          "type": "text-delta",
        },
        {
          "delta": ", ",
          "id": "txt-0",
          "type": "text-delta",
        },
        {
          "delta": "World!",
          "id": "txt-0",
          "type": "text-delta",
        },
        {
          "id": "txt-0",
          "type": "text-end",
        },
        {
          "finishReason": "stop",
          "providerMetadata": {
            "test-provider": {},
          },
          "type": "finish",
          "usage": {
            "cachedInputTokens": undefined,
            "inputTokens": 18,
            "outputTokens": 439,
            "reasoningTokens": undefined,
            "totalTokens": 457,
          },
        },
      ]
    `);
  });

  it('should stream reasoning content before text deltas', async () => {
    server.urls['https://my.api.com/v1/chat/completions'].response = {
      type: 'stream-chunks',
      chunks: [
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"grok-beta",` +
          `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"role":"assistant","content":"", "reasoning_content":"Let me think"},"finish_reason":null}]}\n\n`,
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"grok-beta",` +
          `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"content":"", "reasoning_content":" about this"},"finish_reason":null}]}\n\n`,
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"grok-beta",` +
          `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"content":"Here's"},"finish_reason":null}]}\n\n`,
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"grok-beta",` +
          `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"content":" my response"},"finish_reason":null}]}\n\n`,
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1729171479,"model":"grok-beta",` +
          `"system_fingerprint":"fp_10c08bf97d","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],` +
          `"usage":{"prompt_tokens":18,"completion_tokens":439}}\n\n`,
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
          "id": "chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798",
          "modelId": "grok-beta",
          "timestamp": 2024-03-25T09:06:38.000Z,
          "type": "response-metadata",
        },
        {
          "id": "reasoning-0",
          "type": "reasoning-start",
        },
        {
          "delta": "Let me think",
          "id": "reasoning-0",
          "type": "reasoning-delta",
        },
        {
          "delta": " about this",
          "id": "reasoning-0",
          "type": "reasoning-delta",
        },
        {
          "id": "txt-0",
          "type": "text-start",
        },
        {
          "delta": "Here's",
          "id": "txt-0",
          "type": "text-delta",
        },
        {
          "delta": " my response",
          "id": "txt-0",
          "type": "text-delta",
        },
        {
          "id": "reasoning-0",
          "type": "reasoning-end",
        },
        {
          "id": "txt-0",
          "type": "text-end",
        },
        {
          "finishReason": "stop",
          "providerMetadata": {
            "test-provider": {},
          },
          "type": "finish",
          "usage": {
            "cachedInputTokens": undefined,
            "inputTokens": 18,
            "outputTokens": 439,
            "reasoningTokens": undefined,
            "totalTokens": undefined,
          },
        },
      ]
    `);
  });

  it('should stream reasoning from reasoning field when reasoning_content is not provided', async () => {
    server.urls['https://my.api.com/v1/chat/completions'].response = {
      type: 'stream-chunks',
      chunks: [
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"grok-beta",` +
          `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"role":"assistant","content":"", "reasoning":"Let me consider"},"finish_reason":null}]}\n\n`,
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"grok-beta",` +
          `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"content":"", "reasoning":" this carefully"},"finish_reason":null}]}\n\n`,
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"grok-beta",` +
          `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"content":"My answer is"},"finish_reason":null}]}\n\n`,
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"grok-beta",` +
          `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"content":" correct"},"finish_reason":null}]}\n\n`,
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1729171479,"model":"grok-beta",` +
          `"system_fingerprint":"fp_10c08bf97d","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],` +
          `"usage":{"prompt_tokens":18,"completion_tokens":439}}\n\n`,
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
          "id": "chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798",
          "modelId": "grok-beta",
          "timestamp": 2024-03-25T09:06:38.000Z,
          "type": "response-metadata",
        },
        {
          "id": "reasoning-0",
          "type": "reasoning-start",
        },
        {
          "delta": "Let me consider",
          "id": "reasoning-0",
          "type": "reasoning-delta",
        },
        {
          "delta": " this carefully",
          "id": "reasoning-0",
          "type": "reasoning-delta",
        },
        {
          "id": "txt-0",
          "type": "text-start",
        },
        {
          "delta": "My answer is",
          "id": "txt-0",
          "type": "text-delta",
        },
        {
          "delta": " correct",
          "id": "txt-0",
          "type": "text-delta",
        },
        {
          "id": "reasoning-0",
          "type": "reasoning-end",
        },
        {
          "id": "txt-0",
          "type": "text-end",
        },
        {
          "finishReason": "stop",
          "providerMetadata": {
            "test-provider": {},
          },
          "type": "finish",
          "usage": {
            "cachedInputTokens": undefined,
            "inputTokens": 18,
            "outputTokens": 439,
            "reasoningTokens": undefined,
            "totalTokens": undefined,
          },
        },
      ]
    `);
  });

  it('should prefer reasoning_content over reasoning field in streaming when both are provided', async () => {
    server.urls['https://my.api.com/v1/chat/completions'].response = {
      type: 'stream-chunks',
      chunks: [
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"grok-beta",` +
          `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"role":"assistant","content":"", "reasoning_content":"From reasoning_content", "reasoning":"From reasoning"},"finish_reason":null}]}\n\n`,
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"grok-beta",` +
          `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"content":"Final response"},"finish_reason":null}]}\n\n`,
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1729171479,"model":"grok-beta",` +
          `"system_fingerprint":"fp_10c08bf97d","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],` +
          `"usage":{"prompt_tokens":18,"completion_tokens":439}}\n\n`,
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
          "id": "chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798",
          "modelId": "grok-beta",
          "timestamp": 2024-03-25T09:06:38.000Z,
          "type": "response-metadata",
        },
        {
          "id": "reasoning-0",
          "type": "reasoning-start",
        },
        {
          "delta": "From reasoning_content",
          "id": "reasoning-0",
          "type": "reasoning-delta",
        },
        {
          "id": "txt-0",
          "type": "text-start",
        },
        {
          "delta": "Final response",
          "id": "txt-0",
          "type": "text-delta",
        },
        {
          "id": "reasoning-0",
          "type": "reasoning-end",
        },
        {
          "id": "txt-0",
          "type": "text-end",
        },
        {
          "finishReason": "stop",
          "providerMetadata": {
            "test-provider": {},
          },
          "type": "finish",
          "usage": {
            "cachedInputTokens": undefined,
            "inputTokens": 18,
            "outputTokens": 439,
            "reasoningTokens": undefined,
            "totalTokens": undefined,
          },
        },
      ]
    `);
  });

  it('should stream tool deltas', async () => {
    server.urls['https://my.api.com/v1/chat/completions'].response = {
      type: 'stream-chunks',
      chunks: [
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"grok-beta",` +
          `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"role":"assistant","content":null,` +
          `"tool_calls":[{"index":0,"id":"call_O17Uplv4lJvD6DVdIvFFeRMw","type":"function","function":{"name":"test-tool","arguments":""}}]},` +
          `"finish_reason":null}]}\n\n`,
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"grok-beta",` +
          `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\""}}]},` +
          `"finish_reason":null}]}\n\n`,
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"grok-beta",` +
          `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"value"}}]},` +
          `"finish_reason":null}]}\n\n`,
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"grok-beta",` +
          `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\":\\""}}]},` +
          `"finish_reason":null}]}\n\n`,
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"grok-beta",` +
          `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"Spark"}}]},` +
          `"finish_reason":null}]}\n\n`,
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"grok-beta",` +
          `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"le"}}]},` +
          `"finish_reason":null}]}\n\n`,
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"grok-beta",` +
          `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":" Day"}}]},` +
          `"finish_reason":null}]}\n\n`,
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"grok-beta",` +
          `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"}"}}]},` +
          `"finish_reason":null}]}\n\n`,
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1729171479,"model":"grok-beta",` +
          `"system_fingerprint":"fp_10c08bf97d","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}],` +
          `"usage":{"queue_time":0.061348671,"prompt_tokens":18,"prompt_time":0.000211569,` +
          `"completion_tokens":439,"completion_time":0.798181818,"total_tokens":457,"total_time":0.798393387}}\n\n`,
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
          "id": "chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798",
          "modelId": "grok-beta",
          "timestamp": 2024-03-25T09:06:38.000Z,
          "type": "response-metadata",
        },
        {
          "id": "call_O17Uplv4lJvD6DVdIvFFeRMw",
          "toolName": "test-tool",
          "type": "tool-input-start",
        },
        {
          "delta": "{"",
          "id": "call_O17Uplv4lJvD6DVdIvFFeRMw",
          "type": "tool-input-delta",
        },
        {
          "delta": "value",
          "id": "call_O17Uplv4lJvD6DVdIvFFeRMw",
          "type": "tool-input-delta",
        },
        {
          "delta": "":"",
          "id": "call_O17Uplv4lJvD6DVdIvFFeRMw",
          "type": "tool-input-delta",
        },
        {
          "delta": "Spark",
          "id": "call_O17Uplv4lJvD6DVdIvFFeRMw",
          "type": "tool-input-delta",
        },
        {
          "delta": "le",
          "id": "call_O17Uplv4lJvD6DVdIvFFeRMw",
          "type": "tool-input-delta",
        },
        {
          "delta": " Day",
          "id": "call_O17Uplv4lJvD6DVdIvFFeRMw",
          "type": "tool-input-delta",
        },
        {
          "delta": ""}",
          "id": "call_O17Uplv4lJvD6DVdIvFFeRMw",
          "type": "tool-input-delta",
        },
        {
          "id": "call_O17Uplv4lJvD6DVdIvFFeRMw",
          "type": "tool-input-end",
        },
        {
          "input": "{"value":"Sparkle Day"}",
          "toolCallId": "call_O17Uplv4lJvD6DVdIvFFeRMw",
          "toolName": "test-tool",
          "type": "tool-call",
        },
        {
          "finishReason": "tool-calls",
          "providerMetadata": {
            "test-provider": {},
          },
          "type": "finish",
          "usage": {
            "cachedInputTokens": undefined,
            "inputTokens": 18,
            "outputTokens": 439,
            "reasoningTokens": undefined,
            "totalTokens": 457,
          },
        },
      ]
    `);
  });

  it('should stream tool call deltas when tool call arguments are passed in the first chunk', async () => {
    server.urls['https://my.api.com/v1/chat/completions'].response = {
      type: 'stream-chunks',
      chunks: [
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"grok-beta",` +
          `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"role":"assistant","content":null,` +
          `"tool_calls":[{"index":0,"id":"call_O17Uplv4lJvD6DVdIvFFeRMw","type":"function","function":{"name":"test-tool","arguments":"{\\""}}]},` +
          `"finish_reason":null}]}\n\n`,
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"grok-beta",` +
          `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"va"}}]},` +
          `"finish_reason":null}]}\n\n`,
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"grok-beta",` +
          `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"lue"}}]},` +
          `"finish_reason":null}]}\n\n`,
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"grok-beta",` +
          `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\":\\""}}]},` +
          `"finish_reason":null}]}\n\n`,
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"grok-beta",` +
          `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"Spark"}}]},` +
          `"finish_reason":null}]}\n\n`,
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"grok-beta",` +
          `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"le"}}]},` +
          `"finish_reason":null}]}\n\n`,
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"grok-beta",` +
          `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":" Day"}}]},` +
          `"finish_reason":null}]}\n\n`,
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"grok-beta",` +
          `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"}"}}]},` +
          `"finish_reason":null}]}\n\n`,
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1729171479,"model":"grok-beta",` +
          `"system_fingerprint":"fp_10c08bf97d","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}],` +
          `"usage":{"queue_time":0.061348671,"prompt_tokens":18,"prompt_time":0.000211569,` +
          `"completion_tokens":439,"completion_time":0.798181818,"total_tokens":457,"total_time":0.798393387}}\n\n`,
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
          "id": "chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798",
          "modelId": "grok-beta",
          "timestamp": 2024-03-25T09:06:38.000Z,
          "type": "response-metadata",
        },
        {
          "id": "call_O17Uplv4lJvD6DVdIvFFeRMw",
          "toolName": "test-tool",
          "type": "tool-input-start",
        },
        {
          "id": "call_O17Uplv4lJvD6DVdIvFFeRMw",
          "toolName": "test-tool",
          "type": "tool-input-start",
        },
        {
          "delta": "va",
          "id": "call_O17Uplv4lJvD6DVdIvFFeRMw",
          "type": "tool-input-delta",
        },
        {
          "delta": "lue",
          "id": "call_O17Uplv4lJvD6DVdIvFFeRMw",
          "type": "tool-input-delta",
        },
        {
          "delta": "":"",
          "id": "call_O17Uplv4lJvD6DVdIvFFeRMw",
          "type": "tool-input-delta",
        },
        {
          "delta": "Spark",
          "id": "call_O17Uplv4lJvD6DVdIvFFeRMw",
          "type": "tool-input-delta",
        },
        {
          "delta": "le",
          "id": "call_O17Uplv4lJvD6DVdIvFFeRMw",
          "type": "tool-input-delta",
        },
        {
          "delta": " Day",
          "id": "call_O17Uplv4lJvD6DVdIvFFeRMw",
          "type": "tool-input-delta",
        },
        {
          "delta": ""}",
          "id": "call_O17Uplv4lJvD6DVdIvFFeRMw",
          "type": "tool-input-delta",
        },
        {
          "id": "call_O17Uplv4lJvD6DVdIvFFeRMw",
          "type": "tool-input-end",
        },
        {
          "input": "{"value":"Sparkle Day"}",
          "toolCallId": "call_O17Uplv4lJvD6DVdIvFFeRMw",
          "toolName": "test-tool",
          "type": "tool-call",
        },
        {
          "finishReason": "tool-calls",
          "providerMetadata": {
            "test-provider": {},
          },
          "type": "finish",
          "usage": {
            "cachedInputTokens": undefined,
            "inputTokens": 18,
            "outputTokens": 439,
            "reasoningTokens": undefined,
            "totalTokens": 457,
          },
        },
      ]
    `);
  });

  it('should not duplicate tool calls when there is an additional empty chunk after the tool call has been completed', async () => {
    server.urls['https://my.api.com/v1/chat/completions'].response = {
      type: 'stream-chunks',
      chunks: [
        `data: {"id":"chat-2267f7e2910a4254bac0650ba74cfc1c","object":"chat.completion.chunk","created":1733162241,` +
          `"model":"meta/llama-3.1-8b-instruct:fp8","choices":[{"index":0,"delta":{"role":"assistant","content":""},"logprobs":null,"finish_reason":null}],` +
          `"usage":{"prompt_tokens":226,"total_tokens":226,"completion_tokens":0}}\n\n`,
        `data: {"id":"chat-2267f7e2910a4254bac0650ba74cfc1c","object":"chat.completion.chunk","created":1733162241,` +
          `"model":"meta/llama-3.1-8b-instruct:fp8","choices":[{"index":0,"delta":{"tool_calls":[{"id":"chatcmpl-tool-b3b307239370432d9910d4b79b4dbbaa",` +
          `"type":"function","index":0,"function":{"name":"searchGoogle"}}]},"logprobs":null,"finish_reason":null}],` +
          `"usage":{"prompt_tokens":226,"total_tokens":233,"completion_tokens":7}}\n\n`,
        `data: {"id":"chat-2267f7e2910a4254bac0650ba74cfc1c","object":"chat.completion.chunk","created":1733162241,` +
          `"model":"meta/llama-3.1-8b-instruct:fp8","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,` +
          `"function":{"arguments":"{\\"query\\": \\""}}]},"logprobs":null,"finish_reason":null}],` +
          `"usage":{"prompt_tokens":226,"total_tokens":241,"completion_tokens":15}}\n\n`,
        `data: {"id":"chat-2267f7e2910a4254bac0650ba74cfc1c","object":"chat.completion.chunk","created":1733162241,` +
          `"model":"meta/llama-3.1-8b-instruct:fp8","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,` +
          `"function":{"arguments":"latest"}}]},"logprobs":null,"finish_reason":null}],` +
          `"usage":{"prompt_tokens":226,"total_tokens":242,"completion_tokens":16}}\n\n`,
        `data: {"id":"chat-2267f7e2910a4254bac0650ba74cfc1c","object":"chat.completion.chunk","created":1733162241,` +
          `"model":"meta/llama-3.1-8b-instruct:fp8","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,` +
          `"function":{"arguments":" news"}}]},"logprobs":null,"finish_reason":null}],` +
          `"usage":{"prompt_tokens":226,"total_tokens":243,"completion_tokens":17}}\n\n`,
        `data: {"id":"chat-2267f7e2910a4254bac0650ba74cfc1c","object":"chat.completion.chunk","created":1733162241,` +
          `"model":"meta/llama-3.1-8b-instruct:fp8","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,` +
          `"function":{"arguments":" on"}}]},"logprobs":null,"finish_reason":null}],` +
          `"usage":{"prompt_tokens":226,"total_tokens":244,"completion_tokens":18}}\n\n`,
        `data: {"id":"chat-2267f7e2910a4254bac0650ba74cfc1c","object":"chat.completion.chunk","created":1733162241,` +
          `"model":"meta/llama-3.1-8b-instruct:fp8","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,` +
          `"function":{"arguments":" ai\\"}"}}]},"logprobs":null,"finish_reason":null}],` +
          `"usage":{"prompt_tokens":226,"total_tokens":245,"completion_tokens":19}}\n\n`,
        // empty arguments chunk after the tool call has already been finished:
        `data: {"id":"chat-2267f7e2910a4254bac0650ba74cfc1c","object":"chat.completion.chunk","created":1733162241,` +
          `"model":"meta/llama-3.1-8b-instruct:fp8","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,` +
          `"function":{"arguments":""}}]},"logprobs":null,"finish_reason":"tool_calls","stop_reason":128008}],` +
          `"usage":{"prompt_tokens":226,"total_tokens":246,"completion_tokens":20}}\n\n`,
        `data: {"id":"chat-2267f7e2910a4254bac0650ba74cfc1c","object":"chat.completion.chunk","created":1733162241,` +
          `"model":"meta/llama-3.1-8b-instruct:fp8","choices":[],` +
          `"usage":{"prompt_tokens":226,"total_tokens":246,"completion_tokens":20}}\n\n`,
        `data: [DONE]\n\n`,
      ],
    };

    const { stream } = await model.doStream({
      tools: [
        {
          type: 'function',
          name: 'searchGoogle',
          inputSchema: {
            type: 'object',
            properties: { query: { type: 'string' } },
            required: ['query'],
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
          "id": "chat-2267f7e2910a4254bac0650ba74cfc1c",
          "modelId": "meta/llama-3.1-8b-instruct:fp8",
          "timestamp": 2024-12-02T17:57:21.000Z,
          "type": "response-metadata",
        },
        {
          "id": "chatcmpl-tool-b3b307239370432d9910d4b79b4dbbaa",
          "toolName": "searchGoogle",
          "type": "tool-input-start",
        },
        {
          "delta": "{"query": "",
          "id": "chatcmpl-tool-b3b307239370432d9910d4b79b4dbbaa",
          "type": "tool-input-delta",
        },
        {
          "delta": "latest",
          "id": "chatcmpl-tool-b3b307239370432d9910d4b79b4dbbaa",
          "type": "tool-input-delta",
        },
        {
          "delta": " news",
          "id": "chatcmpl-tool-b3b307239370432d9910d4b79b4dbbaa",
          "type": "tool-input-delta",
        },
        {
          "delta": " on",
          "id": "chatcmpl-tool-b3b307239370432d9910d4b79b4dbbaa",
          "type": "tool-input-delta",
        },
        {
          "delta": " ai"}",
          "id": "chatcmpl-tool-b3b307239370432d9910d4b79b4dbbaa",
          "type": "tool-input-delta",
        },
        {
          "id": "chatcmpl-tool-b3b307239370432d9910d4b79b4dbbaa",
          "type": "tool-input-end",
        },
        {
          "input": "{"query": "latest news on ai"}",
          "toolCallId": "chatcmpl-tool-b3b307239370432d9910d4b79b4dbbaa",
          "toolName": "searchGoogle",
          "type": "tool-call",
        },
        {
          "finishReason": "tool-calls",
          "providerMetadata": {
            "test-provider": {},
          },
          "type": "finish",
          "usage": {
            "cachedInputTokens": undefined,
            "inputTokens": 226,
            "outputTokens": 20,
            "reasoningTokens": undefined,
            "totalTokens": 246,
          },
        },
      ]
    `);
  });

  it('should stream tool call that is sent in one chunk', async () => {
    server.urls['https://my.api.com/v1/chat/completions'].response = {
      type: 'stream-chunks',
      chunks: [
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"grok-beta",` +
          `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"role":"assistant","content":null,` +
          `"tool_calls":[{"index":0,"id":"call_O17Uplv4lJvD6DVdIvFFeRMw","type":"function","function":{"name":"test-tool","arguments":"{\\"value\\":\\"Sparkle Day\\"}"}}]},` +
          `"finish_reason":null}]}\n\n`,
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1729171479,"model":"grok-beta",` +
          `"system_fingerprint":"fp_10c08bf97d","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}],` +
          `"usage":{"queue_time":0.061348671,"prompt_tokens":18,"prompt_time":0.000211569,` +
          `"completion_tokens":439,"completion_time":0.798181818,"total_tokens":457,"total_time":0.798393387}}\n\n`,
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
          "id": "chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798",
          "modelId": "grok-beta",
          "timestamp": 2024-03-25T09:06:38.000Z,
          "type": "response-metadata",
        },
        {
          "id": "call_O17Uplv4lJvD6DVdIvFFeRMw",
          "toolName": "test-tool",
          "type": "tool-input-start",
        },
        {
          "id": "call_O17Uplv4lJvD6DVdIvFFeRMw",
          "toolName": "test-tool",
          "type": "tool-input-start",
        },
        {
          "id": "call_O17Uplv4lJvD6DVdIvFFeRMw",
          "type": "tool-input-end",
        },
        {
          "input": "{"value":"Sparkle Day"}",
          "toolCallId": "call_O17Uplv4lJvD6DVdIvFFeRMw",
          "toolName": "test-tool",
          "type": "tool-call",
        },
        {
          "finishReason": "tool-calls",
          "providerMetadata": {
            "test-provider": {},
          },
          "type": "finish",
          "usage": {
            "cachedInputTokens": undefined,
            "inputTokens": 18,
            "outputTokens": 439,
            "reasoningTokens": undefined,
            "totalTokens": 457,
          },
        },
      ]
    `);
  });

  it('should stream empty tool call that is sent in one chunk', async () => {
    server.urls['https://my.api.com/v1/chat/completions'].response = {
      type: 'stream-chunks',
      chunks: [
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"grok-beta",` +
          `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"role":"assistant","content":null,` +
          `"tool_calls":[{"index":0,"id":"call_O17Uplv4lJvD6DVdIvFFeRMw","type":"function","function":{"name":"test-tool","arguments":""}}]},` +
          `"finish_reason":null}]}\n\n`,
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1729171479,"model":"grok-beta",` +
          `"system_fingerprint":"fp_10c08bf97d","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}],` +
          `"usage":{"queue_time":0.061348671,"prompt_tokens":18,"prompt_time":0.000211569,` +
          `"completion_tokens":439,"completion_time":0.798181818,"total_tokens":457,"total_time":0.798393387}}\n\n`,
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
            properties: {},
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
          "id": "chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798",
          "modelId": "grok-beta",
          "timestamp": 2024-03-25T09:06:38.000Z,
          "type": "response-metadata",
        },
        {
          "id": "call_O17Uplv4lJvD6DVdIvFFeRMw",
          "toolName": "test-tool",
          "type": "tool-input-start",
        },
        {
          "id": "call_O17Uplv4lJvD6DVdIvFFeRMw",
          "type": "tool-input-end",
        },
        {
          "input": "",
          "toolCallId": "call_O17Uplv4lJvD6DVdIvFFeRMw",
          "toolName": "test-tool",
          "type": "tool-call",
        },
        {
          "finishReason": "tool-calls",
          "providerMetadata": {
            "test-provider": {},
          },
          "type": "finish",
          "usage": {
            "cachedInputTokens": undefined,
            "inputTokens": 18,
            "outputTokens": 439,
            "reasoningTokens": undefined,
            "totalTokens": 457,
          },
        },
      ]
    `);
  });

  it('should handle error stream parts', async () => {
    server.urls['https://my.api.com/v1/chat/completions'].response = {
      type: 'stream-chunks',
      chunks: [
        `data: {"error": {"message": "Incorrect API key provided: as***T7. You can obtain an API key from https://console.api.com.", "code": "Client specified an invalid argument"}}\n\n`,
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
          "error": "Incorrect API key provided: as***T7. You can obtain an API key from https://console.api.com.",
          "type": "error",
        },
        {
          "finishReason": "error",
          "providerMetadata": {
            "test-provider": {},
          },
          "type": "finish",
          "usage": {
            "cachedInputTokens": undefined,
            "inputTokens": undefined,
            "outputTokens": undefined,
            "reasoningTokens": undefined,
            "totalTokens": undefined,
          },
        },
      ]
    `);
  });

  it.skipIf(isNodeVersion(20))(
    'should handle unparsable stream parts',
    async () => {
      server.urls['https://my.api.com/v1/chat/completions'].response = {
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
            "providerMetadata": {
              "test-provider": {},
            },
            "type": "finish",
            "usage": {
              "cachedInputTokens": undefined,
              "inputTokens": undefined,
              "outputTokens": undefined,
              "reasoningTokens": undefined,
              "totalTokens": undefined,
            },
          },
        ]
      `);
    },
  );

  it('should expose the raw response headers', async () => {
    prepareStreamResponse({
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

  it('should pass the messages and the model', async () => {
    prepareStreamResponse({ content: [] });

    await model.doStream({
      prompt: TEST_PROMPT,
      includeRawChunks: false,
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      stream: true,
      model: 'grok-beta',
      messages: [{ role: 'user', content: 'Hello' }],
    });
  });

  it('should pass headers', async () => {
    prepareStreamResponse({ content: [] });

    const provider = createOpenAICompatible({
      baseURL: 'https://my.api.com/v1',
      name: 'test-provider',
      headers: {
        Authorization: `Bearer test-api-key`,
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await provider('grok-beta').doStream({
      prompt: TEST_PROMPT,
      includeRawChunks: false,
      headers: {
        'Custom-Request-Header': 'request-header-value',
      },
    });

    expect(await server.calls[0].requestHeaders).toStrictEqual({
      authorization: 'Bearer test-api-key',
      'content-type': 'application/json',
      'custom-provider-header': 'provider-header-value',
      'custom-request-header': 'request-header-value',
    });
  });

  it('should include provider-specific options', async () => {
    prepareStreamResponse({ content: [] });

    await provider('grok-beta').doStream({
      providerOptions: {
        'test-provider': {
          someCustomOption: 'test-value',
        },
      },
      prompt: TEST_PROMPT,
      includeRawChunks: false,
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      stream: true,
      model: 'grok-beta',
      messages: [{ role: 'user', content: 'Hello' }],
      someCustomOption: 'test-value',
    });
  });

  it('should not include provider-specific options for different provider', async () => {
    prepareStreamResponse({ content: [] });

    await provider('grok-beta').doStream({
      providerOptions: {
        notThisProviderName: {
          someCustomOption: 'test-value',
        },
      },
      prompt: TEST_PROMPT,
      includeRawChunks: false,
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      stream: true,
      model: 'grok-beta',
      messages: [{ role: 'user', content: 'Hello' }],
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
          "frequency_penalty": undefined,
          "max_tokens": undefined,
          "messages": [
            {
              "content": "Hello",
              "role": "user",
            },
          ],
          "model": "grok-beta",
          "presence_penalty": undefined,
          "reasoning_effort": undefined,
          "response_format": undefined,
          "seed": undefined,
          "stop": undefined,
          "stream": true,
          "stream_options": undefined,
          "temperature": undefined,
          "tool_choice": undefined,
          "tools": undefined,
          "top_p": undefined,
          "user": undefined,
        },
      }
    `);
  });

  describe('usage details in streaming', () => {
    it('should extract detailed token usage from stream finish', async () => {
      server.urls['https://my.api.com/v1/chat/completions'].response = {
        type: 'stream-chunks',
        chunks: [
          `data: {"id":"chat-id","choices":[{"delta":{"content":"Hello"}}]}\n\n`,
          `data: {"choices":[{"delta":{},"finish_reason":"stop"}],` +
            `"usage":{"prompt_tokens":20,"completion_tokens":30,` +
            `"prompt_tokens_details":{"cached_tokens":5},` +
            `"completion_tokens_details":{` +
            `"reasoning_tokens":10,` +
            `"accepted_prediction_tokens":15,` +
            `"rejected_prediction_tokens":5}}}\n\n`,
          'data: [DONE]\n\n',
        ],
      };

      const { stream } = await model.doStream({
        prompt: TEST_PROMPT,
        includeRawChunks: false,
      });

      const parts = await convertReadableStreamToArray(stream);
      const finishPart = parts.find(part => part.type === 'finish');

      expect(finishPart).toMatchInlineSnapshot(`
        {
          "finishReason": "stop",
          "providerMetadata": {
            "test-provider": {
              "acceptedPredictionTokens": 15,
              "rejectedPredictionTokens": 5,
            },
          },
          "type": "finish",
          "usage": {
            "cachedInputTokens": 5,
            "inputTokens": 20,
            "outputTokens": 30,
            "reasoningTokens": 10,
            "totalTokens": undefined,
          },
        }
      `);
    });

    it('should handle missing token details in stream', async () => {
      server.urls['https://my.api.com/v1/chat/completions'].response = {
        type: 'stream-chunks',
        chunks: [
          `data: {"id":"chat-id","choices":[{"delta":{"content":"Hello"}}]}\n\n`,
          `data: {"choices":[{"delta":{},"finish_reason":"stop"}],` +
            `"usage":{"prompt_tokens":20,"completion_tokens":30}}\n\n`,
          'data: [DONE]\n\n',
        ],
      };

      const { stream } = await model.doStream({
        prompt: TEST_PROMPT,
        includeRawChunks: false,
      });

      const parts = await convertReadableStreamToArray(stream);
      const finishPart = parts.find(part => part.type === 'finish');

      expect(finishPart?.providerMetadata!['test-provider']).toStrictEqual({});
    });

    it('should handle partial token details in stream', async () => {
      server.urls['https://my.api.com/v1/chat/completions'].response = {
        type: 'stream-chunks',
        chunks: [
          `data: {"id":"chat-id","choices":[{"delta":{"content":"Hello"}}]}\n\n`,
          `data: {"choices":[{"delta":{},"finish_reason":"stop"}],` +
            `"usage":{"prompt_tokens":20,"completion_tokens":30,` +
            `"total_tokens":50,` +
            `"prompt_tokens_details":{"cached_tokens":5},` +
            `"completion_tokens_details":{"reasoning_tokens":10}}}\n\n`,
          'data: [DONE]\n\n',
        ],
      };

      const { stream } = await model.doStream({
        prompt: TEST_PROMPT,
        includeRawChunks: false,
      });

      const parts = await convertReadableStreamToArray(stream);
      const finishPart = parts.find(part => part.type === 'finish');

      expect(finishPart).toMatchInlineSnapshot(`
        {
          "finishReason": "stop",
          "providerMetadata": {
            "test-provider": {},
          },
          "type": "finish",
          "usage": {
            "cachedInputTokens": 5,
            "inputTokens": 20,
            "outputTokens": 30,
            "reasoningTokens": 10,
            "totalTokens": 50,
          },
        }
      `);
    });
  });
});

describe('metadata extraction', () => {
  const testMetadataExtractor = {
    extractMetadata: async ({ parsedBody }: { parsedBody: unknown }) => {
      if (
        typeof parsedBody !== 'object' ||
        !parsedBody ||
        !('test_field' in parsedBody)
      ) {
        return undefined;
      }
      return {
        'test-provider': {
          value: parsedBody.test_field as string,
        },
      };
    },
    createStreamExtractor: () => {
      let accumulatedValue: string | undefined;

      return {
        processChunk: (chunk: unknown) => {
          if (
            typeof chunk === 'object' &&
            chunk &&
            'choices' in chunk &&
            Array.isArray(chunk.choices) &&
            chunk.choices[0]?.finish_reason === 'stop' &&
            'test_field' in chunk
          ) {
            accumulatedValue = chunk.test_field as string;
          }
        },
        buildMetadata: () =>
          accumulatedValue
            ? {
                'test-provider': {
                  value: accumulatedValue,
                },
              }
            : undefined,
      };
    },
  };

  it('should process metadata from complete response', async () => {
    server.urls['https://my.api.com/v1/chat/completions'].response = {
      type: 'json-value',
      body: {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1711115037,
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
            },
            finish_reason: 'stop',
          },
        ],
        test_field: 'test_value',
      },
    };

    const model = new OpenAICompatibleChatLanguageModel('gpt-4', {
      provider: 'test-provider',
      url: () => 'https://my.api.com/v1/chat/completions',
      headers: () => ({}),
      metadataExtractor: testMetadataExtractor,
    });

    const result = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(result.providerMetadata).toEqual({
      'test-provider': {
        value: 'test_value',
      },
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello' }],
    });
  });

  it('should process metadata from streaming response', async () => {
    server.urls['https://my.api.com/v1/chat/completions'].response = {
      type: 'stream-chunks',
      chunks: [
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: {"choices":[{"finish_reason":"stop"}],"test_field":"test_value"}\n\n',
        'data: [DONE]\n\n',
      ],
    };

    const model = new OpenAICompatibleChatLanguageModel('gpt-4', {
      provider: 'test-provider',
      url: () => 'https://my.api.com/v1/chat/completions',
      headers: () => ({}),
      metadataExtractor: testMetadataExtractor,
    });

    const result = await model.doStream({
      prompt: TEST_PROMPT,
      includeRawChunks: false,
    });

    const parts = await convertReadableStreamToArray(result.stream);
    const finishPart = parts.find(part => part.type === 'finish');

    expect(finishPart?.providerMetadata).toEqual({
      'test-provider': {
        value: 'test_value',
      },
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello' }],
      stream: true,
    });
  });
});

describe('raw chunks', () => {
  it('should include raw chunks when includeRawChunks is true', async () => {
    server.urls['https://my.api.com/v1/chat/completions'].response = {
      type: 'stream-chunks',
      chunks: [
        `data: {"id":"chat-id","choices":[{"delta":{"content":"Hello"}}]}\n\n`,
        `data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n`,
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
                },
              },
            ],
            "id": "chat-id",
          },
          "type": "raw",
        },
        {
          "id": "chat-id",
          "modelId": undefined,
          "timestamp": undefined,
          "type": "response-metadata",
        },
        {
          "id": "txt-0",
          "type": "text-start",
        },
        {
          "delta": "Hello",
          "id": "txt-0",
          "type": "text-delta",
        },
        {
          "rawValue": {
            "choices": [
              {
                "delta": {},
                "finish_reason": "stop",
              },
            ],
          },
          "type": "raw",
        },
        {
          "id": "txt-0",
          "type": "text-end",
        },
        {
          "finishReason": "stop",
          "providerMetadata": {
            "test-provider": {},
          },
          "type": "finish",
          "usage": {
            "cachedInputTokens": undefined,
            "inputTokens": undefined,
            "outputTokens": undefined,
            "reasoningTokens": undefined,
            "totalTokens": undefined,
          },
        },
      ]
    `);
  });
});
