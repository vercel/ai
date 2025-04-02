import { LanguageModelV1Prompt } from '@ai-sdk/provider';
import {
  convertReadableStreamToArray,
  createTestServer,
} from '@ai-sdk/provider-utils/test';
import { OpenAICompatibleChatLanguageModel } from './openai-compatible-chat-language-model';
import { createOpenAICompatible } from './openai-compatible-provider';

const TEST_PROMPT: LanguageModelV1Prompt = [
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
    const model = new OpenAICompatibleChatLanguageModel(
      'gpt-4',
      {},
      {
        provider: 'anthropic.beta',
        url: () => '',
        headers: () => ({}),
      },
    );

    expect(model['providerOptionsName']).toBe('anthropic');
  });

  it('should handle provider without dot notation', () => {
    const model = new OpenAICompatibleChatLanguageModel(
      'gpt-4',
      {},
      {
        provider: 'openai',
        url: () => '',
        headers: () => ({}),
      },
    );

    expect(model['providerOptionsName']).toBe('openai');
  });

  it('should return empty for empty provider', () => {
    const model = new OpenAICompatibleChatLanguageModel(
      'gpt-4',
      {},
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
    reasoning_content = '',
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
    const modelWithUser = provider('grok-beta', {
      user: 'test-user-id',
    });
    await modelWithUser.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });
    expect(await server.calls[0].requestBody).toMatchObject({
      user: 'test-user-id',
    });
  });

  it('should extract text response', async () => {
    prepareJsonResponse({ content: 'Hello, World!' });

    const { text } = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(text).toStrictEqual('Hello, World!');
  });

  it('should extract reasoning content', async () => {
    prepareJsonResponse({
      content: 'Hello, World!',
      reasoning_content: 'This is the reasoning behind the response',
    });

    const { text, reasoning } = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(text).toStrictEqual('Hello, World!');
    expect(reasoning).toStrictEqual(
      'This is the reasoning behind the response',
    );
  });

  it('should extract usage', async () => {
    prepareJsonResponse({
      content: '',
      usage: { prompt_tokens: 20, total_tokens: 25, completion_tokens: 5 },
    });

    const { usage } = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(usage).toStrictEqual({
      promptTokens: 20,
      completionTokens: 5,
    });
  });

  it('should send additional response information', async () => {
    prepareJsonResponse({
      id: 'test-id',
      created: 123,
      model: 'test-model',
    });

    const { response } = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(response).toStrictEqual({
      id: 'test-id',
      timestamp: new Date(123 * 1000),
      modelId: 'test-model',
    });
  });

  it('should support partial usage', async () => {
    prepareJsonResponse({
      content: '',
      usage: { prompt_tokens: 20, total_tokens: 20 },
    });

    const { usage } = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(usage).toStrictEqual({
      promptTokens: 20,
      completionTokens: NaN,
    });
  });

  it('should extract finish reason', async () => {
    prepareJsonResponse({
      content: '',
      finish_reason: 'stop',
    });

    const response = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(response.finishReason).toStrictEqual('stop');
  });

  it('should support unknown finish reason', async () => {
    prepareJsonResponse({
      content: '',
      finish_reason: 'eos',
    });

    const response = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(response.finishReason).toStrictEqual('unknown');
  });

  it('should expose the raw response headers', async () => {
    prepareJsonResponse({
      headers: { 'test-header': 'test-value' },
    });

    const { rawResponse } = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(rawResponse?.headers).toStrictEqual({
      // default headers:
      'content-length': '335',
      'content-type': 'application/json',

      // custom header
      'test-header': 'test-value',
    });
  });

  it('should pass the model and the messages', async () => {
    prepareJsonResponse({ content: '' });

    await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await server.calls[0].requestBody).toStrictEqual({
      model: 'grok-beta',
      messages: [{ role: 'user', content: 'Hello' }],
    });
  });

  it('should pass settings', async () => {
    prepareJsonResponse();

    await provider('grok-beta', {
      user: 'test-user-id',
    }).doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await server.calls[0].requestBody).toStrictEqual({
      model: 'grok-beta',
      messages: [{ role: 'user', content: 'Hello' }],
      user: 'test-user-id',
    });
  });

  it('should include provider-specific options', async () => {
    prepareJsonResponse();

    await provider('grok-beta').doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      providerMetadata: {
        'test-provider': {
          someCustomOption: 'test-value',
        },
      },
      prompt: TEST_PROMPT,
    });

    expect(await server.calls[0].requestBody).toStrictEqual({
      model: 'grok-beta',
      messages: [{ role: 'user', content: 'Hello' }],
      someCustomOption: 'test-value',
    });
  });

  it('should not include provider-specific options for different provider', async () => {
    prepareJsonResponse();

    await provider('grok-beta').doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      providerMetadata: {
        notThisProviderName: {
          someCustomOption: 'test-value',
        },
      },
      prompt: TEST_PROMPT,
    });

    expect(await server.calls[0].requestBody).toStrictEqual({
      model: 'grok-beta',
      messages: [{ role: 'user', content: 'Hello' }],
    });
  });

  it('should pass tools and toolChoice', async () => {
    prepareJsonResponse({ content: '' });

    await model.doGenerate({
      inputFormat: 'prompt',
      mode: {
        type: 'regular',
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
      },
      prompt: TEST_PROMPT,
    });

    expect(await server.calls[0].requestBody).toStrictEqual({
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
      inputFormat: 'prompt',
      mode: { type: 'regular' },
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
      inputFormat: 'prompt',
      mode: {
        type: 'regular',
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
      },
      prompt: TEST_PROMPT,
    });

    expect(result.toolCalls).toStrictEqual([
      {
        args: '{"value":"Spark"}',
        toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
        toolCallType: 'function',
        toolName: 'test-tool',
      },
    ]);
  });

  describe('response format', () => {
    it('should not send a response_format when response format is text', async () => {
      prepareJsonResponse({ content: '{"value":"Spark"}' });

      const model = new OpenAICompatibleChatLanguageModel(
        'gpt-4o-2024-08-06',
        {},
        {
          provider: 'test-provider',
          url: () => 'https://my.api.com/v1/chat/completions',
          headers: () => ({}),
          supportsStructuredOutputs: false,
        },
      );

      await model.doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
        responseFormat: { type: 'text' },
      });

      expect(await server.calls[0].requestBody).toStrictEqual({
        model: 'gpt-4o-2024-08-06',
        messages: [{ role: 'user', content: 'Hello' }],
      });
    });

    it('should forward json response format as "json_object" without schema', async () => {
      prepareJsonResponse({ content: '{"value":"Spark"}' });

      const model = provider('gpt-4o-2024-08-06');

      await model.doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
        responseFormat: { type: 'json' },
      });

      expect(await server.calls[0].requestBody).toStrictEqual({
        model: 'gpt-4o-2024-08-06',
        messages: [{ role: 'user', content: 'Hello' }],
        response_format: { type: 'json_object' },
      });
    });

    it('should forward json response format as "json_object" and omit schema when structuredOutputs are disabled', async () => {
      prepareJsonResponse({ content: '{"value":"Spark"}' });

      const model = new OpenAICompatibleChatLanguageModel(
        'gpt-4o-2024-08-06',
        {},
        {
          provider: 'test-provider',
          url: () => 'https://my.api.com/v1/chat/completions',
          headers: () => ({}),
          supportsStructuredOutputs: false,
        },
      );

      const { warnings } = await model.doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
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

      expect(await server.calls[0].requestBody).toStrictEqual({
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

      const model = new OpenAICompatibleChatLanguageModel(
        'gpt-4o-2024-08-06',
        {},
        {
          provider: 'test-provider',
          url: () => 'https://my.api.com/v1/chat/completions',
          headers: () => ({}),
          supportsStructuredOutputs: true,
        },
      );

      const { warnings } = await model.doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
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

      expect(await server.calls[0].requestBody).toStrictEqual({
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

    it('should use json_schema & strict in object-json mode when structuredOutputs are enabled', async () => {
      prepareJsonResponse({ content: '{"value":"Spark"}' });

      const model = new OpenAICompatibleChatLanguageModel(
        'gpt-4o-2024-08-06',
        {},
        {
          provider: 'test-provider',
          url: () => 'https://my.api.com/v1/chat/completions',
          headers: () => ({}),
          supportsStructuredOutputs: true,
        },
      );

      await model.doGenerate({
        inputFormat: 'prompt',
        mode: {
          type: 'object-json',
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

      expect(await server.calls[0].requestBody).toStrictEqual({
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

    it('should set name & description in object-json mode when structuredOutputs are enabled', async () => {
      prepareJsonResponse({ content: '{"value":"Spark"}' });

      const model = new OpenAICompatibleChatLanguageModel(
        'gpt-4o-2024-08-06',
        {},
        {
          provider: 'test-provider',
          url: () => 'https://my.api.com/v1/chat/completions',
          headers: () => ({}),
          supportsStructuredOutputs: true,
        },
      );

      await model.doGenerate({
        inputFormat: 'prompt',
        mode: {
          type: 'object-json',
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

      expect(await server.calls[0].requestBody).toStrictEqual({
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

    it('should allow for undefined schema in object-json mode when structuredOutputs are enabled', async () => {
      prepareJsonResponse({ content: '{"value":"Spark"}' });

      const model = new OpenAICompatibleChatLanguageModel(
        'gpt-4o-2024-08-06',
        {},
        {
          provider: 'test-provider',
          url: () => 'https://my.api.com/v1/chat/completions',
          headers: () => ({}),
          supportsStructuredOutputs: true,
        },
      );

      await model.doGenerate({
        inputFormat: 'prompt',
        mode: {
          type: 'object-json',
          name: 'test-name',
          description: 'test description',
        },
        prompt: TEST_PROMPT,
      });

      expect(await server.calls[0].requestBody).toStrictEqual({
        model: 'gpt-4o-2024-08-06',
        messages: [{ role: 'user', content: 'Hello' }],
        response_format: {
          type: 'json_object',
        },
      });
    });

    it('should set strict in object-tool mode when structuredOutputs are enabled', async () => {
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

      const model = new OpenAICompatibleChatLanguageModel(
        'gpt-4o-2024-08-06',
        {},
        {
          provider: 'test-provider',
          url: () => 'https://my.api.com/v1/chat/completions',
          headers: () => ({}),
          supportsStructuredOutputs: true,
        },
      );

      const result = await model.doGenerate({
        inputFormat: 'prompt',
        mode: {
          type: 'object-tool',
          tool: {
            type: 'function',
            name: 'test-tool',
            description: 'test description',
            parameters: {
              type: 'object',
              properties: { value: { type: 'string' } },
              required: ['value'],
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
        },
        prompt: TEST_PROMPT,
      });

      expect(await server.calls[0].requestBody).toStrictEqual({
        model: 'gpt-4o-2024-08-06',
        messages: [{ role: 'user', content: 'Hello' }],
        tool_choice: { type: 'function', function: { name: 'test-tool' } },
        tools: [
          {
            type: 'function',
            function: {
              name: 'test-tool',
              description: 'test description',
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
      });

      expect(result.toolCalls).toStrictEqual([
        {
          args: '{"value":"Spark"}',
          toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
          toolCallType: 'function',
          toolName: 'test-tool',
        },
      ]);
    });
  });

  it('should send request body', async () => {
    prepareJsonResponse({ content: '' });

    const { request } = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(request).toStrictEqual({
      body: '{"model":"grok-beta","messages":[{"role":"user","content":"Hello"}]}',
    });
  });

  describe('usage details', () => {
    it('should extract detailed token usage when available', async () => {
      prepareJsonResponse({
        content: '',
        usage: {
          prompt_tokens: 20,
          completion_tokens: 30,
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
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
      });

      expect(result.providerMetadata!['test-provider']).toStrictEqual({
        cachedPromptTokens: 5,
        reasoningTokens: 10,
        acceptedPredictionTokens: 15,
        rejectedPredictionTokens: 5,
      });
    });

    it('should handle missing token details', async () => {
      prepareJsonResponse({
        content: '',
        usage: {
          prompt_tokens: 20,
          completion_tokens: 30,
          // No token details provided
        },
      });

      const result = await model.doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
      });

      expect(result.providerMetadata!['test-provider']).toStrictEqual({});
    });

    it('should handle partial token details', async () => {
      prepareJsonResponse({
        content: '',
        usage: {
          prompt_tokens: 20,
          completion_tokens: 30,
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
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
      });

      expect(result.providerMetadata!['test-provider']).toStrictEqual({
        cachedPromptTokens: 5,
        reasoningTokens: 10,
      });
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

  it('should stream text deltas', async () => {
    prepareStreamResponse({
      content: ['Hello', ', ', 'World!'],
      finish_reason: 'stop',
    });

    const { stream } = await model.doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    // note: space moved to last chunk bc of trimming
    expect(await convertReadableStreamToArray(stream)).toStrictEqual([
      {
        type: 'response-metadata',
        id: 'chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798',
        modelId: 'grok-beta',
        timestamp: new Date('2023-12-15T16:17:00.000Z'),
      },
      { type: 'text-delta', textDelta: '' },
      { type: 'text-delta', textDelta: 'Hello' },
      { type: 'text-delta', textDelta: ', ' },
      { type: 'text-delta', textDelta: 'World!' },
      {
        type: 'finish',
        finishReason: 'stop',
        usage: { promptTokens: 18, completionTokens: 439 },
        providerMetadata: {
          'test-provider': {},
        },
      },
    ]);
  });

  it('should stream reasoning content before text deltas', async () => {
    server.urls['https://my.api.com/v1/chat/completions'].response = {
      type: 'stream-chunks',
      chunks: [
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"grok-beta",` +
          `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":"Let me think"},"finish_reason":null}]}\n\n`,
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"grok-beta",` +
          `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"reasoning_content":" about this"},"finish_reason":null}]}\n\n`,
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
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await convertReadableStreamToArray(stream)).toStrictEqual([
      {
        type: 'response-metadata',
        id: 'chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798',
        modelId: 'grok-beta',
        timestamp: new Date('2024-03-25T09:06:38.000Z'),
      },
      {
        type: 'reasoning',
        textDelta: 'Let me think',
      },
      {
        type: 'reasoning',
        textDelta: ' about this',
      },
      {
        type: 'text-delta',
        textDelta: "Here's",
      },
      {
        type: 'text-delta',
        textDelta: ' my response',
      },
      {
        type: 'finish',
        finishReason: 'stop',
        usage: { promptTokens: 18, completionTokens: 439 },
        providerMetadata: {
          'test-provider': {},
        },
      },
    ]);
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
      inputFormat: 'prompt',
      mode: {
        type: 'regular',
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
      },
      prompt: TEST_PROMPT,
    });

    expect(await convertReadableStreamToArray(stream)).toStrictEqual([
      {
        type: 'response-metadata',
        id: 'chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798',
        modelId: 'grok-beta',
        timestamp: new Date('2024-03-25T09:06:38.000Z'),
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
        toolCallType: 'function',
        toolName: 'test-tool',
        argsTextDelta: '{"',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
        toolCallType: 'function',
        toolName: 'test-tool',
        argsTextDelta: 'value',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
        toolCallType: 'function',
        toolName: 'test-tool',
        argsTextDelta: '":"',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
        toolCallType: 'function',
        toolName: 'test-tool',
        argsTextDelta: 'Spark',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
        toolCallType: 'function',
        toolName: 'test-tool',
        argsTextDelta: 'le',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
        toolCallType: 'function',
        toolName: 'test-tool',
        argsTextDelta: ' Day',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
        toolCallType: 'function',
        toolName: 'test-tool',
        argsTextDelta: '"}',
      },
      {
        type: 'tool-call',
        toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
        toolCallType: 'function',
        toolName: 'test-tool',
        args: '{"value":"Sparkle Day"}',
      },
      {
        type: 'finish',
        finishReason: 'tool-calls',
        usage: { promptTokens: 18, completionTokens: 439 },
        providerMetadata: {
          'test-provider': {},
        },
      },
    ]);
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
      inputFormat: 'prompt',
      mode: {
        type: 'regular',
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
      },
      prompt: TEST_PROMPT,
    });

    expect(await convertReadableStreamToArray(stream)).toStrictEqual([
      {
        type: 'response-metadata',
        id: 'chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798',
        modelId: 'grok-beta',
        timestamp: new Date('2024-03-25T09:06:38.000Z'),
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
        toolCallType: 'function',
        toolName: 'test-tool',
        argsTextDelta: '{"',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
        toolCallType: 'function',
        toolName: 'test-tool',
        argsTextDelta: 'va',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
        toolCallType: 'function',
        toolName: 'test-tool',
        argsTextDelta: 'lue',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
        toolCallType: 'function',
        toolName: 'test-tool',
        argsTextDelta: '":"',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
        toolCallType: 'function',
        toolName: 'test-tool',
        argsTextDelta: 'Spark',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
        toolCallType: 'function',
        toolName: 'test-tool',
        argsTextDelta: 'le',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
        toolCallType: 'function',
        toolName: 'test-tool',
        argsTextDelta: ' Day',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
        toolCallType: 'function',
        toolName: 'test-tool',
        argsTextDelta: '"}',
      },
      {
        type: 'tool-call',
        toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
        toolCallType: 'function',
        toolName: 'test-tool',
        args: '{"value":"Sparkle Day"}',
      },
      {
        type: 'finish',
        finishReason: 'tool-calls',
        usage: { promptTokens: 18, completionTokens: 439 },
        providerMetadata: {
          'test-provider': {},
        },
      },
    ]);
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
      inputFormat: 'prompt',
      mode: {
        type: 'regular',
        tools: [
          {
            type: 'function',
            name: 'searchGoogle',
            parameters: {
              type: 'object',
              properties: { query: { type: 'string' } },
              required: ['query'],
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
        ],
      },
      prompt: TEST_PROMPT,
    });

    expect(await convertReadableStreamToArray(stream)).toStrictEqual([
      {
        type: 'response-metadata',
        id: 'chat-2267f7e2910a4254bac0650ba74cfc1c',
        modelId: 'meta/llama-3.1-8b-instruct:fp8',
        timestamp: new Date('2024-12-02T17:57:21.000Z'),
      },
      {
        type: 'text-delta',
        textDelta: '',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'chatcmpl-tool-b3b307239370432d9910d4b79b4dbbaa',
        toolCallType: 'function',
        toolName: 'searchGoogle',
        argsTextDelta: '{"query": "',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'chatcmpl-tool-b3b307239370432d9910d4b79b4dbbaa',
        toolCallType: 'function',
        toolName: 'searchGoogle',
        argsTextDelta: 'latest',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'chatcmpl-tool-b3b307239370432d9910d4b79b4dbbaa',
        toolCallType: 'function',
        toolName: 'searchGoogle',
        argsTextDelta: ' news',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'chatcmpl-tool-b3b307239370432d9910d4b79b4dbbaa',
        toolCallType: 'function',
        toolName: 'searchGoogle',
        argsTextDelta: ' on',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'chatcmpl-tool-b3b307239370432d9910d4b79b4dbbaa',
        toolCallType: 'function',
        toolName: 'searchGoogle',
        argsTextDelta: ' ai"}',
      },
      {
        type: 'tool-call',
        toolCallId: 'chatcmpl-tool-b3b307239370432d9910d4b79b4dbbaa',
        toolCallType: 'function',
        toolName: 'searchGoogle',
        args: '{"query": "latest news on ai"}',
      },
      {
        type: 'finish',
        finishReason: 'tool-calls',
        usage: { promptTokens: 226, completionTokens: 20 },
        providerMetadata: {
          'test-provider': {},
        },
      },
    ]);
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
      inputFormat: 'prompt',
      mode: {
        type: 'regular',
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
      },
      prompt: TEST_PROMPT,
    });

    expect(await convertReadableStreamToArray(stream)).toStrictEqual([
      {
        type: 'response-metadata',
        id: 'chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798',
        modelId: 'grok-beta',
        timestamp: new Date('2024-03-25T09:06:38.000Z'),
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
        toolCallType: 'function',
        toolName: 'test-tool',
        argsTextDelta: '{"value":"Sparkle Day"}',
      },
      {
        type: 'tool-call',
        toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
        toolCallType: 'function',
        toolName: 'test-tool',
        args: '{"value":"Sparkle Day"}',
      },
      {
        type: 'finish',
        finishReason: 'tool-calls',
        usage: { promptTokens: 18, completionTokens: 439 },
        providerMetadata: {
          'test-provider': {},
        },
      },
    ]);
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
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await convertReadableStreamToArray(stream)).toStrictEqual([
      {
        type: 'error',
        error:
          'Incorrect API key provided: as***T7. You can obtain an API key from https://console.api.com.',
      },
      {
        type: 'finish',
        finishReason: 'error',
        usage: {
          promptTokens: NaN,
          completionTokens: NaN,
        },
        providerMetadata: {
          'test-provider': {},
        },
      },
    ]);
  });

  it('should handle unparsable stream parts', async () => {
    server.urls['https://my.api.com/v1/chat/completions'].response = {
      type: 'stream-chunks',
      chunks: [`data: {unparsable}\n\n`, 'data: [DONE]\n\n'],
    };

    const { stream } = await model.doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    const elements = await convertReadableStreamToArray(stream);

    expect(elements.length).toBe(2);
    expect(elements[0].type).toBe('error');
    expect(elements[1]).toStrictEqual({
      finishReason: 'error',
      type: 'finish',
      usage: {
        completionTokens: NaN,
        promptTokens: NaN,
      },
      providerMetadata: {
        'test-provider': {},
      },
    });
  });

  it('should expose the raw response headers', async () => {
    prepareStreamResponse({
      headers: { 'test-header': 'test-value' },
    });

    const { rawResponse } = await model.doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(rawResponse?.headers).toStrictEqual({
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
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await server.calls[0].requestBody).toStrictEqual({
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
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
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
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      providerMetadata: {
        'test-provider': {
          someCustomOption: 'test-value',
        },
      },
      prompt: TEST_PROMPT,
    });

    expect(await server.calls[0].requestBody).toStrictEqual({
      stream: true,
      model: 'grok-beta',
      messages: [{ role: 'user', content: 'Hello' }],
      someCustomOption: 'test-value',
    });
  });

  it('should not include provider-specific options for different provider', async () => {
    prepareStreamResponse({ content: [] });

    await provider('grok-beta').doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      providerMetadata: {
        notThisProviderName: {
          someCustomOption: 'test-value',
        },
      },
      prompt: TEST_PROMPT,
    });

    expect(await server.calls[0].requestBody).toStrictEqual({
      stream: true,
      model: 'grok-beta',
      messages: [{ role: 'user', content: 'Hello' }],
    });
  });

  it('should send request body', async () => {
    prepareStreamResponse({ content: [] });

    const { request } = await model.doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(request).toStrictEqual({
      body: '{"model":"grok-beta","messages":[{"role":"user","content":"Hello"}],"stream":true}',
    });
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
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
      });

      const parts = await convertReadableStreamToArray(stream);
      const finishPart = parts.find(part => part.type === 'finish');

      expect(finishPart?.providerMetadata!['test-provider']).toStrictEqual({
        cachedPromptTokens: 5,
        reasoningTokens: 10,
        acceptedPredictionTokens: 15,
        rejectedPredictionTokens: 5,
      });
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
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
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
            `"prompt_tokens_details":{"cached_tokens":5},` +
            `"completion_tokens_details":{"reasoning_tokens":10}}}\n\n`,
          'data: [DONE]\n\n',
        ],
      };

      const { stream } = await model.doStream({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
      });

      const parts = await convertReadableStreamToArray(stream);
      const finishPart = parts.find(part => part.type === 'finish');

      expect(finishPart?.providerMetadata!['test-provider']).toStrictEqual({
        cachedPromptTokens: 5,
        reasoningTokens: 10,
      });
    });
  });
});

describe('doStream simulated streaming', () => {
  function prepareJsonResponse({
    content = '',
    reasoning_content = '',
    tool_calls,
    usage = {
      prompt_tokens: 4,
      total_tokens: 34,
      completion_tokens: 30,
    },
    finish_reason = 'stop',
    id = 'chatcmpl-95ZTZkhr0mHNKqerQfiwkuox3PHAd',
    created = 1711115037,
    model = 'gpt-3.5-turbo-0125',
  }: {
    content?: string;
    reasoning_content?: string;
    tool_calls?: Array<{
      id: string;
      type: 'function';
      function: {
        name: string;
        arguments: string;
      };
    }>;
    usage?: {
      prompt_tokens?: number;
      total_tokens?: number;
      completion_tokens?: number;
    };
    finish_reason?: string;
    created?: number;
    id?: string;
    model?: string;
  } = {}) {
    server.urls['https://my.api.com/v1/chat/completions'].response = {
      type: 'json-value',
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
              tool_calls,
              reasoning_content,
            },
            finish_reason,
          },
        ],
        usage,
        system_fingerprint: 'fp_3bc1b5746c',
      },
    };
  }

  it('should stream text delta', async () => {
    prepareJsonResponse({ content: 'Hello, World!', model: 'o1-preview' });

    const model = provider.chatModel('o1', {
      simulateStreaming: true,
    });

    const { stream } = await model.doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await convertReadableStreamToArray(stream)).toStrictEqual([
      {
        type: 'response-metadata',
        id: 'chatcmpl-95ZTZkhr0mHNKqerQfiwkuox3PHAd',
        modelId: 'o1-preview',
        timestamp: expect.any(Date),
      },
      { type: 'text-delta', textDelta: 'Hello, World!' },
      {
        type: 'finish',
        finishReason: 'stop',
        usage: { promptTokens: 4, completionTokens: 30 },
        logprobs: undefined,
        providerMetadata: {
          'test-provider': {},
        },
      },
    ]);
  });

  it('should stream reasoning content before text delta in simulated streaming', async () => {
    prepareJsonResponse({
      content: 'Hello, World!',
      reasoning_content: 'This is the reasoning',
      model: 'o1-preview',
    });

    const model = provider.chatModel('o1', {
      simulateStreaming: true,
    });

    const { stream } = await model.doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await convertReadableStreamToArray(stream)).toStrictEqual([
      {
        type: 'response-metadata',
        id: 'chatcmpl-95ZTZkhr0mHNKqerQfiwkuox3PHAd',
        modelId: 'o1-preview',
        timestamp: expect.any(Date),
      },
      {
        type: 'reasoning',
        textDelta: 'This is the reasoning',
      },
      {
        type: 'text-delta',
        textDelta: 'Hello, World!',
      },
      {
        type: 'finish',
        finishReason: 'stop',
        usage: { promptTokens: 4, completionTokens: 30 },
        logprobs: undefined,
        providerMetadata: {
          'test-provider': {},
        },
      },
    ]);
  });

  it('should stream tool calls', async () => {
    prepareJsonResponse({
      model: 'o1-preview',
      tool_calls: [
        {
          id: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
          type: 'function',
          function: {
            name: 'test-tool',
            arguments: '{"value":"Sparkle Day"}',
          },
        },
      ],
    });

    const model = provider.chatModel('o1', {
      simulateStreaming: true,
    });

    const { stream } = await model.doStream({
      inputFormat: 'prompt',
      mode: {
        type: 'regular',
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
      },
      prompt: TEST_PROMPT,
    });

    expect(await convertReadableStreamToArray(stream)).toStrictEqual([
      {
        type: 'response-metadata',
        id: 'chatcmpl-95ZTZkhr0mHNKqerQfiwkuox3PHAd',
        modelId: 'o1-preview',
        timestamp: expect.any(Date),
      },
      {
        type: 'tool-call',
        toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
        toolCallType: 'function',
        toolName: 'test-tool',
        args: '{"value":"Sparkle Day"}',
      },
      {
        type: 'finish',
        finishReason: 'stop',
        usage: { promptTokens: 4, completionTokens: 30 },
        logprobs: undefined,
        providerMetadata: {
          'test-provider': {},
        },
      },
    ]);
  });
});

describe('metadata extraction', () => {
  const testMetadataExtractor = {
    extractMetadata: ({ parsedBody }: { parsedBody: unknown }) => {
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
              content: 'Hello',
            },
            finish_reason: 'stop',
          },
        ],
        test_field: 'test_value',
      },
    };

    const model = new OpenAICompatibleChatLanguageModel(
      'gpt-4',
      {},
      {
        provider: 'test-provider',
        url: () => 'https://my.api.com/v1/chat/completions',
        headers: () => ({}),
        metadataExtractor: testMetadataExtractor,
      },
    );

    const result = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(result.providerMetadata).toEqual({
      'test-provider': {
        value: 'test_value',
      },
    });

    expect(await server.calls[0].requestBody).toStrictEqual({
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

    const model = new OpenAICompatibleChatLanguageModel(
      'gpt-4',
      {},
      {
        provider: 'test-provider',
        url: () => 'https://my.api.com/v1/chat/completions',
        headers: () => ({}),
        metadataExtractor: testMetadataExtractor,
      },
    );

    const result = await model.doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    const parts = await convertReadableStreamToArray(result.stream);
    const finishPart = parts.find(part => part.type === 'finish');

    expect(finishPart?.providerMetadata).toEqual({
      'test-provider': {
        value: 'test_value',
      },
    });

    expect(await server.calls[0].requestBody).toStrictEqual({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello' }],
      stream: true,
    });
  });
});
