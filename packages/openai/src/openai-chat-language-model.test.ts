import { LanguageModelV1, LanguageModelV1Prompt } from '@ai-sdk/provider';
import {
  JsonTestServer,
  StreamingTestServer,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { mapOpenAIChatLogProbsOutput } from './map-openai-chat-logprobs';
import { createOpenAI } from './openai-provider';

const TEST_PROMPT: LanguageModelV1Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const TEST_LOGPROBS = {
  content: [
    {
      token: 'Hello',
      logprob: -0.0009994634,
      top_logprobs: [
        {
          token: 'Hello',
          logprob: -0.0009994634,
        },
      ],
    },
    {
      token: '!',
      logprob: -0.13410144,
      top_logprobs: [
        {
          token: '!',
          logprob: -0.13410144,
        },
      ],
    },
    {
      token: ' How',
      logprob: -0.0009250381,
      top_logprobs: [
        {
          token: ' How',
          logprob: -0.0009250381,
        },
      ],
    },
    {
      token: ' can',
      logprob: -0.047709424,
      top_logprobs: [
        {
          token: ' can',
          logprob: -0.047709424,
        },
      ],
    },
    {
      token: ' I',
      logprob: -0.000009014684,
      top_logprobs: [
        {
          token: ' I',
          logprob: -0.000009014684,
        },
      ],
    },
    {
      token: ' assist',
      logprob: -0.009125131,
      top_logprobs: [
        {
          token: ' assist',
          logprob: -0.009125131,
        },
      ],
    },
    {
      token: ' you',
      logprob: -0.0000066306106,
      top_logprobs: [
        {
          token: ' you',
          logprob: -0.0000066306106,
        },
      ],
    },
    {
      token: ' today',
      logprob: -0.00011093382,
      top_logprobs: [
        {
          token: ' today',
          logprob: -0.00011093382,
        },
      ],
    },
    {
      token: '?',
      logprob: -0.00004596782,
      top_logprobs: [
        {
          token: '?',
          logprob: -0.00004596782,
        },
      ],
    },
  ],
};

const provider = createOpenAI({
  apiKey: 'test-api-key',
  compatibility: 'strict',
});

const model = provider.chat('gpt-3.5-turbo');

describe('settings', () => {
  it('should set supportsImageUrls to true by default', () => {
    const defaultModel = provider.chat('gpt-3.5-turbo');
    expect(defaultModel.supportsImageUrls).toBe(true);
  });

  it('should set supportsImageUrls to false when downloadImages is true', () => {
    const modelWithDownloadImages = provider.chat('gpt-3.5-turbo', {
      downloadImages: true,
    });
    expect(modelWithDownloadImages.supportsImageUrls).toBe(false);
  });

  it('should set supportsImageUrls to true when downloadImages is false', () => {
    const modelWithoutDownloadImages = provider.chat('gpt-3.5-turbo', {
      downloadImages: false,
    });
    expect(modelWithoutDownloadImages.supportsImageUrls).toBe(true);
  });
});

describe('doGenerate', () => {
  const server = new JsonTestServer(
    'https://api.openai.com/v1/chat/completions',
  );

  server.setupTestEnvironment();

  function prepareJsonResponse({
    content = '',
    tool_calls,
    function_call,
    usage = {
      prompt_tokens: 4,
      total_tokens: 34,
      completion_tokens: 30,
    },
    logprobs = null,
    finish_reason = 'stop',
    id = 'chatcmpl-95ZTZkhr0mHNKqerQfiwkuox3PHAd',
    created = 1711115037,
    model = 'gpt-3.5-turbo-0125',
  }: {
    content?: string;
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
      completion_tokens_details?: {
        reasoning_tokens?: number;
      };
      prompt_tokens_details?: {
        cached_tokens?: number;
      };
    };
    logprobs?: {
      content:
        | {
            token: string;
            logprob: number;
            top_logprobs: { token: string; logprob: number }[];
          }[]
        | null;
    } | null;
    finish_reason?: string;
    created?: number;
    id?: string;
    model?: string;
  } = {}) {
    server.responseBodyJson = {
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
            function_call,
          },
          logprobs,
          finish_reason,
        },
      ],
      usage,
      system_fingerprint: 'fp_3bc1b5746c',
    };
  }

  it('should extract text response', async () => {
    prepareJsonResponse({ content: 'Hello, World!' });

    const { text } = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(text).toStrictEqual('Hello, World!');
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

  it('should send request body', async () => {
    prepareJsonResponse({});

    const { request } = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(request).toStrictEqual({
      body: '{"model":"gpt-3.5-turbo","messages":[{"role":"user","content":"Hello"}]}',
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

  it('should extract logprobs', async () => {
    prepareJsonResponse({
      logprobs: TEST_LOGPROBS,
    });

    const response = await provider
      .chat('gpt-3.5-turbo', { logprobs: 1 })
      .doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
      });
    expect(response.logprobs).toStrictEqual(
      mapOpenAIChatLogProbsOutput(TEST_LOGPROBS),
    );
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
    prepareJsonResponse({ content: '' });

    server.responseHeaders = {
      'test-header': 'test-value',
    };

    const { rawResponse } = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(rawResponse?.headers).toStrictEqual({
      // default headers:
      'content-length': '337',
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

    expect(await server.getRequestBodyJson()).toStrictEqual({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Hello' }],
    });
  });

  it('should pass settings', async () => {
    prepareJsonResponse();

    await provider
      .chat('gpt-3.5-turbo', {
        logitBias: { 50256: -100 },
        logprobs: 2,
        parallelToolCalls: false,
        user: 'test-user-id',
      })
      .doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
      });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Hello' }],
      logprobs: true,
      top_logprobs: 2,
      logit_bias: { 50256: -100 },
      parallel_tool_calls: false,
      user: 'test-user-id',
    });
  });

  it('should pass reasoningEffort setting from provider metadata', async () => {
    prepareJsonResponse({ content: '' });

    const model = provider.chat('o1-mini');

    await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
      providerMetadata: {
        openai: { reasoningEffort: 'low' },
      },
    });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      model: 'o1-mini',
      messages: [{ role: 'user', content: 'Hello' }],
      reasoning_effort: 'low',
    });
  });

  it('should pass reasoningEffort setting from settings', async () => {
    prepareJsonResponse({ content: '' });

    const model = provider.chat('o1-mini', { reasoningEffort: 'high' });

    await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      model: 'o1-mini',
      messages: [{ role: 'user', content: 'Hello' }],
      reasoning_effort: 'high',
    });
  });

  it('should prioritize reasoningEffort from provider metadata over settings', async () => {
    prepareJsonResponse({ content: '' });

    const model = provider.chat('o1-mini', { reasoningEffort: 'high' });

    await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
      providerMetadata: {
        openai: { reasoningEffort: 'low' },
      },
    });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      model: 'o1-mini',
      messages: [{ role: 'user', content: 'Hello' }],
      reasoning_effort: 'low',
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

    expect(await server.getRequestBodyJson()).toStrictEqual({
      model: 'gpt-3.5-turbo',
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

    const provider = createOpenAI({
      apiKey: 'test-api-key',
      organization: 'test-organization',
      project: 'test-project',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await provider.chat('gpt-3.5-turbo').doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
      headers: {
        'Custom-Request-Header': 'request-header-value',
      },
    });

    const requestHeaders = await server.getRequestHeaders();

    expect(requestHeaders).toStrictEqual({
      authorization: 'Bearer test-api-key',
      'content-type': 'application/json',
      'custom-provider-header': 'provider-header-value',
      'custom-request-header': 'request-header-value',
      'openai-organization': 'test-organization',
      'openai-project': 'test-project',
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

  describe('when useLegacyFunctionCalling is enabled', () => {
    let result: Awaited<ReturnType<LanguageModelV1['doGenerate']>>;

    beforeEach(async () => {
      prepareJsonResponse({
        function_call: {
          name: 'test-tool',
          arguments: '{"value":"Spark"}',
        },
      });

      const model = provider.chat('gpt-3.5-turbo', {
        useLegacyFunctionCalling: true,
      });

      result = await model.doGenerate({
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
    });

    it('should pass functions and function_call with useLegacyFunctionCalling', async () => {
      expect(await server.getRequestBodyJson()).toEqual({
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'gpt-3.5-turbo',
        functions: [
          {
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
        function_call: { name: 'test-tool' },
      });
    });

    it('should parse function results with useLegacyFunctionCalling', async () => {
      expect(result.toolCalls).toStrictEqual([
        {
          args: '{"value":"Spark"}',
          toolCallId: expect.any(String),
          toolCallType: 'function',
          toolName: 'test-tool',
        },
      ]);
    });
  });

  describe('response format', () => {
    it('should not send a response_format when response format is text', async () => {
      prepareJsonResponse({ content: '{"value":"Spark"}' });

      const model = provider.chat('gpt-4o-2024-08-06');

      await model.doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
        responseFormat: { type: 'text' },
      });

      expect(await server.getRequestBodyJson()).toStrictEqual({
        model: 'gpt-4o-2024-08-06',
        messages: [{ role: 'user', content: 'Hello' }],
      });
    });

    it('should forward json response format as "json_object" without schema', async () => {
      prepareJsonResponse({ content: '{"value":"Spark"}' });

      const model = provider.chat('gpt-4o-2024-08-06');

      await model.doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
        responseFormat: { type: 'json' },
      });

      expect(await server.getRequestBodyJson()).toStrictEqual({
        model: 'gpt-4o-2024-08-06',
        messages: [{ role: 'user', content: 'Hello' }],
        response_format: { type: 'json_object' },
      });
    });

    it('should forward json response format as "json_object" and omit schema when structuredOutputs are disabled', async () => {
      prepareJsonResponse({ content: '{"value":"Spark"}' });

      const model = provider.chat('gpt-4o-2024-08-06', {
        structuredOutputs: false,
      });

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

      expect(await server.getRequestBodyJson()).toStrictEqual({
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

      const model = provider.chat('gpt-4o-2024-08-06', {
        structuredOutputs: true,
      });

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

      expect(await server.getRequestBodyJson()).toStrictEqual({
        model: 'gpt-4o-2024-08-06',
        messages: [{ role: 'user', content: 'Hello' }],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'response',
            strict: true,
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

      const model = provider.chat('gpt-4o-2024-08-06', {
        structuredOutputs: true,
      });

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

      expect(await server.getRequestBodyJson()).toStrictEqual({
        model: 'gpt-4o-2024-08-06',
        messages: [{ role: 'user', content: 'Hello' }],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'response',
            strict: true,
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

      const model = provider.chat('gpt-4o-2024-08-06', {
        structuredOutputs: true,
      });

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

      expect(await server.getRequestBodyJson()).toStrictEqual({
        model: 'gpt-4o-2024-08-06',
        messages: [{ role: 'user', content: 'Hello' }],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'test-name',
            description: 'test description',
            strict: true,
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

      const model = provider.chat('gpt-4o-2024-08-06', {
        structuredOutputs: true,
      });

      await model.doGenerate({
        inputFormat: 'prompt',
        mode: {
          type: 'object-json',
          name: 'test-name',
          description: 'test description',
        },
        prompt: TEST_PROMPT,
      });

      expect(await server.getRequestBodyJson()).toStrictEqual({
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

      const model = provider.chat('gpt-4o-2024-08-06', {
        structuredOutputs: true,
      });

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

      expect(await server.getRequestBodyJson()).toStrictEqual({
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
              strict: true,
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

  it('should set strict for tool usage when structuredOutputs are enabled', async () => {
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

    const model = provider.chat('gpt-4o-2024-08-06', {
      structuredOutputs: true,
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

    expect(await server.getRequestBodyJson()).toStrictEqual({
      model: 'gpt-4o-2024-08-06',
      messages: [{ role: 'user', content: 'Hello' }],
      tool_choice: { type: 'function', function: { name: 'test-tool' } },
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
            strict: true,
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

  it('should return cached_tokens in prompt_details_tokens', async () => {
    prepareJsonResponse({
      usage: {
        prompt_tokens: 15,
        completion_tokens: 20,
        total_tokens: 35,
        prompt_tokens_details: {
          cached_tokens: 1152,
        },
      },
    });

    const model = provider.chat('gpt-4o-mini');

    const result = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(result.providerMetadata).toStrictEqual({
      openai: {
        cachedPromptTokens: 1152,
      },
    });
  });

  describe('reasoning models', () => {
    it('should clear out temperature, top_p, frequency_penalty, presence_penalty', async () => {
      prepareJsonResponse();

      const model = provider.chat('o1-preview');

      await model.doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
        temperature: 0.5,
        topP: 0.7,
        frequencyPenalty: 0.2,
        presencePenalty: 0.3,
      });

      expect(await server.getRequestBodyJson()).toStrictEqual({
        model: 'o1-preview',
        messages: [{ role: 'user', content: 'Hello' }],
      });
    });
  });

  it('should return the reasoning tokens in the provider metadata', async () => {
    prepareJsonResponse({
      usage: {
        prompt_tokens: 15,
        completion_tokens: 20,
        total_tokens: 35,
        completion_tokens_details: {
          reasoning_tokens: 10,
        },
      },
    });

    const model = provider.chat('o1-preview');

    const result = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(result.providerMetadata).toStrictEqual({
      openai: {
        reasoningTokens: 10,
      },
    });
  });

  it('should send max_completion_tokens extension setting', async () => {
    prepareJsonResponse({ model: 'o1-preview' });

    const model = provider.chat('o1-preview');

    await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
      providerMetadata: {
        openai: {
          maxCompletionTokens: 255,
        },
      },
    });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      model: 'o1-preview',
      messages: [{ role: 'user', content: 'Hello' }],
      max_completion_tokens: 255,
    });
  });

  it('should send prediction extension setting', async () => {
    prepareJsonResponse({ content: '' });

    await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
      providerMetadata: {
        openai: {
          prediction: {
            type: 'content',
            content: 'Hello, World!',
          },
        },
      },
    });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Hello' }],
      prediction: {
        type: 'content',
        content: 'Hello, World!',
      },
    });
  });

  it('should send store extension setting', async () => {
    prepareJsonResponse({ content: '' });

    await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
      providerMetadata: {
        openai: {
          store: true,
        },
      },
    });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Hello' }],
      store: true,
    });
  });

  it('should send metadata extension values', async () => {
    prepareJsonResponse({ content: '' });

    await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
      providerMetadata: {
        openai: {
          metadata: {
            custom: 'value',
          },
        },
      },
    });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Hello' }],
      metadata: {
        custom: 'value',
      },
    });
  });
});

describe('doStream', () => {
  const server = new StreamingTestServer(
    'https://api.openai.com/v1/chat/completions',
  );

  server.setupTestEnvironment();

  function prepareStreamResponse({
    content,
    usage = {
      prompt_tokens: 17,
      total_tokens: 244,
      completion_tokens: 227,
    },
    logprobs = null,
    finish_reason = 'stop',
    model = 'gpt-3.5-turbo-0613',
  }: {
    content: string[];
    usage?: {
      prompt_tokens: number;
      total_tokens: number;
      completion_tokens: number;
      prompt_tokens_details?: {
        cached_tokens?: number;
      };
      completion_tokens_details?: {
        reasoning_tokens: number;
      };
    };
    logprobs?: {
      content:
        | {
            token: string;
            logprob: number;
            top_logprobs: { token: string; logprob: number }[];
          }[]
        | null;
    } | null;
    finish_reason?: string;
    model?: string;
  }) {
    server.responseChunks = [
      `data: {"id":"chatcmpl-96aZqmeDpA9IPD6tACY8djkMsJCMP","object":"chat.completion.chunk","created":1702657020,"model":"${model}",` +
        `"system_fingerprint":null,"choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}\n\n`,
      ...content.map(text => {
        return (
          `data: {"id":"chatcmpl-96aZqmeDpA9IPD6tACY8djkMsJCMP","object":"chat.completion.chunk","created":1702657020,"model":"${model}",` +
          `"system_fingerprint":null,"choices":[{"index":1,"delta":{"content":"${text}"},"finish_reason":null}]}\n\n`
        );
      }),
      `data: {"id":"chatcmpl-96aZqmeDpA9IPD6tACY8djkMsJCMP","object":"chat.completion.chunk","created":1702657020,"model":"${model}",` +
        `"system_fingerprint":null,"choices":[{"index":0,"delta":{},"finish_reason":"${finish_reason}","logprobs":${JSON.stringify(
          logprobs,
        )}}]}\n\n`,
      `data: {"id":"chatcmpl-96aZqmeDpA9IPD6tACY8djkMsJCMP","object":"chat.completion.chunk","created":1702657020,"model":"${model}",` +
        `"system_fingerprint":"fp_3bc1b5746c","choices":[],"usage":${JSON.stringify(
          usage,
        )}}\n\n`,
      'data: [DONE]\n\n',
    ];
  }

  it('should stream text deltas', async () => {
    prepareStreamResponse({
      content: ['Hello', ', ', 'World!'],
      finish_reason: 'stop',
      usage: {
        prompt_tokens: 17,
        total_tokens: 244,
        completion_tokens: 227,
      },
      logprobs: TEST_LOGPROBS,
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
        id: 'chatcmpl-96aZqmeDpA9IPD6tACY8djkMsJCMP',
        modelId: 'gpt-3.5-turbo-0613',
        timestamp: new Date('2023-12-15T16:17:00.000Z'),
      },
      { type: 'text-delta', textDelta: '' },
      { type: 'text-delta', textDelta: 'Hello' },
      { type: 'text-delta', textDelta: ', ' },
      { type: 'text-delta', textDelta: 'World!' },
      {
        type: 'finish',
        finishReason: 'stop',
        logprobs: mapOpenAIChatLogProbsOutput(TEST_LOGPROBS),
        usage: { promptTokens: 17, completionTokens: 227 },
      },
    ]);
  });

  it('should stream tool deltas', async () => {
    server.responseChunks = [
      `data: {"id":"chatcmpl-96aZqmeDpA9IPD6tACY8djkMsJCMP","object":"chat.completion.chunk","created":1711357598,"model":"gpt-3.5-turbo-0125",` +
        `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"role":"assistant","content":null,` +
        `"tool_calls":[{"index":0,"id":"call_O17Uplv4lJvD6DVdIvFFeRMw","type":"function","function":{"name":"test-tool","arguments":""}}]},` +
        `"logprobs":null,"finish_reason":null}]}\n\n`,
      `data: {"id":"chatcmpl-96aZqmeDpA9IPD6tACY8djkMsJCMP","object":"chat.completion.chunk","created":1711357598,"model":"gpt-3.5-turbo-0125",` +
        `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\""}}]},` +
        `"logprobs":null,"finish_reason":null}]}\n\n`,
      `data: {"id":"chatcmpl-96aZqmeDpA9IPD6tACY8djkMsJCMP","object":"chat.completion.chunk","created":1711357598,"model":"gpt-3.5-turbo-0125",` +
        `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"value"}}]},` +
        `"logprobs":null,"finish_reason":null}]}\n\n`,
      `data: {"id":"chatcmpl-96aZqmeDpA9IPD6tACY8djkMsJCMP","object":"chat.completion.chunk","created":1711357598,"model":"gpt-3.5-turbo-0125",` +
        `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\":\\""}}]},` +
        `"logprobs":null,"finish_reason":null}]}\n\n`,
      `data: {"id":"chatcmpl-96aZqmeDpA9IPD6tACY8djkMsJCMP","object":"chat.completion.chunk","created":1711357598,"model":"gpt-3.5-turbo-0125",` +
        `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"Spark"}}]},` +
        `"logprobs":null,"finish_reason":null}]}\n\n`,
      `data: {"id":"chatcmpl-96aZqmeDpA9IPD6tACY8djkMsJCMP","object":"chat.completion.chunk","created":1711357598,"model":"gpt-3.5-turbo-0125",` +
        `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"le"}}]},` +
        `"logprobs":null,"finish_reason":null}]}\n\n`,
      `data: {"id":"chatcmpl-96aZqmeDpA9IPD6tACY8djkMsJCMP","object":"chat.completion.chunk","created":1711357598,"model":"gpt-3.5-turbo-0125",` +
        `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":" Day"}}]},` +
        `"logprobs":null,"finish_reason":null}]}\n\n`,
      `data: {"id":"chatcmpl-96aZqmeDpA9IPD6tACY8djkMsJCMP","object":"chat.completion.chunk","created":1711357598,"model":"gpt-3.5-turbo-0125",` +
        `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"}"}}]},` +
        `"logprobs":null,"finish_reason":null}]}\n\n`,
      `data: {"id":"chatcmpl-96aZqmeDpA9IPD6tACY8djkMsJCMP","object":"chat.completion.chunk","created":1711357598,"model":"gpt-3.5-turbo-0125",` +
        `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{},"logprobs":null,"finish_reason":"tool_calls"}]}\n\n`,
      `data: {"id":"chatcmpl-96aZqmeDpA9IPD6tACY8djkMsJCMP","object":"chat.completion.chunk","created":1711357598,"model":"gpt-3.5-turbo-0125",` +
        `"system_fingerprint":"fp_3bc1b5746c","choices":[],"usage":{"prompt_tokens":53,"completion_tokens":17,"total_tokens":70}}\n\n`,
      'data: [DONE]\n\n',
    ];

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
        id: 'chatcmpl-96aZqmeDpA9IPD6tACY8djkMsJCMP',
        modelId: 'gpt-3.5-turbo-0125',
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
        logprobs: undefined,
        usage: { promptTokens: 53, completionTokens: 17 },
      },
    ]);
  });

  it('should stream tool call deltas when tool call arguments are passed in the first chunk', async () => {
    server.responseChunks = [
      `data: {"id":"chatcmpl-96aZqmeDpA9IPD6tACY8djkMsJCMP","object":"chat.completion.chunk","created":1711357598,"model":"gpt-3.5-turbo-0125",` +
        `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"role":"assistant","content":null,` +
        `"tool_calls":[{"index":0,"id":"call_O17Uplv4lJvD6DVdIvFFeRMw","type":"function","function":{"name":"test-tool","arguments":"{\\""}}]},` +
        `"logprobs":null,"finish_reason":null}]}\n\n`,
      `data: {"id":"chatcmpl-96aZqmeDpA9IPD6tACY8djkMsJCMP","object":"chat.completion.chunk","created":1711357598,"model":"gpt-3.5-turbo-0125",` +
        `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"va"}}]},` +
        `"logprobs":null,"finish_reason":null}]}\n\n`,
      `data: {"id":"chatcmpl-96aZqmeDpA9IPD6tACY8djkMsJCMP","object":"chat.completion.chunk","created":1711357598,"model":"gpt-3.5-turbo-0125",` +
        `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"lue"}}]},` +
        `"logprobs":null,"finish_reason":null}]}\n\n`,
      `data: {"id":"chatcmpl-96aZqmeDpA9IPD6tACY8djkMsJCMP","object":"chat.completion.chunk","created":1711357598,"model":"gpt-3.5-turbo-0125",` +
        `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\":\\""}}]},` +
        `"logprobs":null,"finish_reason":null}]}\n\n`,
      `data: {"id":"chatcmpl-96aZqmeDpA9IPD6tACY8djkMsJCMP","object":"chat.completion.chunk","created":1711357598,"model":"gpt-3.5-turbo-0125",` +
        `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"Spark"}}]},` +
        `"logprobs":null,"finish_reason":null}]}\n\n`,
      `data: {"id":"chatcmpl-96aZqmeDpA9IPD6tACY8djkMsJCMP","object":"chat.completion.chunk","created":1711357598,"model":"gpt-3.5-turbo-0125",` +
        `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"le"}}]},` +
        `"logprobs":null,"finish_reason":null}]}\n\n`,
      `data: {"id":"chatcmpl-96aZqmeDpA9IPD6tACY8djkMsJCMP","object":"chat.completion.chunk","created":1711357598,"model":"gpt-3.5-turbo-0125",` +
        `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":" Day"}}]},` +
        `"logprobs":null,"finish_reason":null}]}\n\n`,
      `data: {"id":"chatcmpl-96aZqmeDpA9IPD6tACY8djkMsJCMP","object":"chat.completion.chunk","created":1711357598,"model":"gpt-3.5-turbo-0125",` +
        `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"}"}}]},` +
        `"logprobs":null,"finish_reason":null}]}\n\n`,
      `data: {"id":"chatcmpl-96aZqmeDpA9IPD6tACY8djkMsJCMP","object":"chat.completion.chunk","created":1711357598,"model":"gpt-3.5-turbo-0125",` +
        `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{},"logprobs":null,"finish_reason":"tool_calls"}]}\n\n`,
      `data: {"id":"chatcmpl-96aZqmeDpA9IPD6tACY8djkMsJCMP","object":"chat.completion.chunk","created":1711357598,"model":"gpt-3.5-turbo-0125",` +
        `"system_fingerprint":"fp_3bc1b5746c","choices":[],"usage":{"prompt_tokens":53,"completion_tokens":17,"total_tokens":70}}\n\n`,
      'data: [DONE]\n\n',
    ];

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
        id: 'chatcmpl-96aZqmeDpA9IPD6tACY8djkMsJCMP',
        modelId: 'gpt-3.5-turbo-0125',
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
        logprobs: undefined,
        usage: { promptTokens: 53, completionTokens: 17 },
      },
    ]);
  });

  it('should not duplicate tool calls when there is an additional empty chunk after the tool call has been completed', async () => {
    server.responseChunks = [
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
    ];

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
        logprobs: undefined,
        usage: { promptTokens: 226, completionTokens: 20 },
      },
    ]);
  });

  it('should stream tool call that is sent in one chunk', async () => {
    server.responseChunks = [
      `data: {"id":"chatcmpl-96aZqmeDpA9IPD6tACY8djkMsJCMP","object":"chat.completion.chunk","created":1711357598,"model":"gpt-3.5-turbo-0125",` +
        `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"role":"assistant","content":null,` +
        `"tool_calls":[{"index":0,"id":"call_O17Uplv4lJvD6DVdIvFFeRMw","type":"function","function":{"name":"test-tool","arguments":"{\\"value\\":\\"Sparkle Day\\"}"}}]},` +
        `"logprobs":null,"finish_reason":null}]}\n\n`,
      `data: {"id":"chatcmpl-96aZqmeDpA9IPD6tACY8djkMsJCMP","object":"chat.completion.chunk","created":1711357598,"model":"gpt-3.5-turbo-0125",` +
        `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{},"logprobs":null,"finish_reason":"tool_calls"}]}\n\n`,
      `data: {"id":"chatcmpl-96aZqmeDpA9IPD6tACY8djkMsJCMP","object":"chat.completion.chunk","created":1711357598,"model":"gpt-3.5-turbo-0125",` +
        `"system_fingerprint":"fp_3bc1b5746c","choices":[],"usage":{"prompt_tokens":53,"completion_tokens":17,"total_tokens":70}}\n\n`,
      'data: [DONE]\n\n',
    ];

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
        id: 'chatcmpl-96aZqmeDpA9IPD6tACY8djkMsJCMP',
        modelId: 'gpt-3.5-turbo-0125',
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
        logprobs: undefined,
        usage: { promptTokens: 53, completionTokens: 17 },
      },
    ]);
  });

  it('should stream function deltas with legacy function calling', async () => {
    server.responseChunks = [
      `data: {"id":"chatcmpl-9o4RjdXk92In6yOzgND3bJxtedhS2","object":"chat.completion.chunk","created":1721720519,"model":"gpt-4-turbo-2024-04-09","system_fingerprint":"fp_7b3074c4b0",` +
        `"choices":[{"index":0,"delta":{"role":"assistant","content":null,"function_call":{"name":"test-tool","arguments":""}},"logprobs":null,"finish_reason":null}],"usage":null}\n\n`,
      `data: {"id":"chatcmpl-9o4RjdXk92In6yOzgND3bJxtedhS2","object":"chat.completion.chunk","created":1721720519,"model":"gpt-4-turbo-2024-04-09","system_fingerprint":"fp_7b3074c4b0",` +
        `"choices":[{"index":0,"delta":{"function_call":{"arguments":"{\\"value\\""}},"logprobs":null,"finish_reason":null}],"usage":null}\n\n`,
      `data: {"id":"chatcmpl-9o4RjdXk92In6yOzgND3bJxtedhS2","object":"chat.completion.chunk","created":1721720519,"model":"gpt-4-turbo-2024-04-09","system_fingerprint":"fp_7b3074c4b0",` +
        `"choices":[{"index":0,"delta":{"function_call":{"arguments":":\\"Sparkle Day\\"}"}},"logprobs":null,"finish_reason":null}],"usage":null}\n\n`,
      `data: {"id":"chatcmpl-9o4RjdXk92In6yOzgND3bJxtedhS2","object":"chat.completion.chunk","created":1721720519,"model":"gpt-4-turbo-2024-04-09","system_fingerprint":"fp_7b3074c4b0",` +
        `"choices":[{"index":0,"delta":{},"logprobs":null,"finish_reason":"stop"}],"usage":null}\n\n`,
      `data: {"id":"chatcmpl-9o4RjdXk92In6yOzgND3bJxtedhS2","object":"chat.completion.chunk","created":1721720519,"model":"gpt-4-turbo-2024-04-09","system_fingerprint":"fp_7b3074c4b0",` +
        `"choices":[],"usage":{"prompt_tokens":53,"completion_tokens":17,"total_tokens":70}}\n\n`,
    ];

    const model = provider.chat('gpt-4-turbo', {
      useLegacyFunctionCalling: true,
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
        id: 'chatcmpl-9o4RjdXk92In6yOzgND3bJxtedhS2',
        modelId: 'gpt-4-turbo-2024-04-09',
        timestamp: new Date('2024-07-23T07:41:59.000Z'),
      },
      {
        type: 'tool-call-delta',
        toolCallId: expect.any(String),
        toolCallType: 'function',
        toolName: 'test-tool',
        argsTextDelta: '{"value"',
      },
      {
        type: 'tool-call-delta',
        toolCallId: expect.any(String),
        toolCallType: 'function',
        toolName: 'test-tool',
        argsTextDelta: ':"Sparkle Day"}',
      },
      {
        type: 'tool-call',
        toolCallId: expect.any(String),
        toolCallType: 'function',
        toolName: 'test-tool',
        args: '{"value":"Sparkle Day"}',
      },
      {
        type: 'finish',
        finishReason: 'stop',
        logprobs: undefined,
        usage: { promptTokens: 53, completionTokens: 17 },
      },
    ]);
  });

  it('should handle error stream parts', async () => {
    server.responseChunks = [
      `data: {"error":{"message": "The server had an error processing your request. Sorry about that! You can retry your request, or contact us through our ` +
        `help center at help.openai.com if you keep seeing this error.","type":"server_error","param":null,"code":null}}\n\n`,
      'data: [DONE]\n\n',
    ];

    const { stream } = await model.doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await convertReadableStreamToArray(stream)).toStrictEqual([
      {
        type: 'error',
        error: {
          message:
            'The server had an error processing your request. Sorry about that! ' +
            'You can retry your request, or contact us through our help center at ' +
            'help.openai.com if you keep seeing this error.',
          type: 'server_error',
          code: null,
          param: null,
        },
      },
      {
        finishReason: 'error',
        logprobs: undefined,
        type: 'finish',
        usage: {
          completionTokens: NaN,
          promptTokens: NaN,
        },
      },
    ]);
  });

  it('should handle unparsable stream parts', async () => {
    server.responseChunks = [`data: {unparsable}\n\n`, 'data: [DONE]\n\n'];

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
      logprobs: undefined,
      type: 'finish',
      usage: {
        completionTokens: NaN,
        promptTokens: NaN,
      },
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
      body: '{"model":"gpt-3.5-turbo","messages":[{"role":"user","content":"Hello"}],"stream":true,"stream_options":{"include_usage":true}}',
    });
  });

  it('should expose the raw response headers', async () => {
    prepareStreamResponse({ content: [] });

    server.responseHeaders = {
      'test-header': 'test-value',
    };

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

    expect(await server.getRequestBodyJson()).toStrictEqual({
      stream: true,
      stream_options: { include_usage: true },
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Hello' }],
    });
  });

  it('should pass headers', async () => {
    prepareStreamResponse({ content: [] });

    const provider = createOpenAI({
      apiKey: 'test-api-key',
      organization: 'test-organization',
      project: 'test-project',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await provider.chat('gpt-3.5-turbo').doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
      headers: {
        'Custom-Request-Header': 'request-header-value',
      },
    });

    const requestHeaders = await server.getRequestHeaders();

    expect(requestHeaders).toStrictEqual({
      authorization: 'Bearer test-api-key',
      'content-type': 'application/json',
      'custom-provider-header': 'provider-header-value',
      'custom-request-header': 'request-header-value',
      'openai-organization': 'test-organization',
      'openai-project': 'test-project',
    });
  });

  it('should handle cached tokens in experimental_providerMetadata', async () => {
    prepareStreamResponse({
      content: [],
      usage: {
        prompt_tokens: 15,
        completion_tokens: 20,
        total_tokens: 35,
        prompt_tokens_details: {
          cached_tokens: 1152,
        },
      },
    });

    const { stream } = await model.doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      stream: true,
      stream_options: { include_usage: true },
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Hello' }],
    });

    const chunksArr = await convertReadableStreamToArray(stream);
    expect(chunksArr[chunksArr.length - 1]).toHaveProperty('providerMetadata');
    expect(chunksArr[chunksArr.length - 1].type).toEqual('finish');
    expect(chunksArr[chunksArr.length - 1]).toStrictEqual({
      type: 'finish',
      finishReason: 'stop',
      logprobs: undefined,
      usage: {
        promptTokens: 15,
        completionTokens: 20,
      },
      providerMetadata: {
        openai: { cachedPromptTokens: 1152 },
      },
    });
  });

  it('should send store extension setting', async () => {
    prepareStreamResponse({ content: [] });

    await model.doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
      providerMetadata: {
        openai: {
          store: true,
        },
      },
    });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      model: 'gpt-3.5-turbo',
      stream: true,
      stream_options: { include_usage: true },
      messages: [{ role: 'user', content: 'Hello' }],
      store: true,
    });
  });

  it('should send metadata extension values', async () => {
    prepareStreamResponse({ content: [] });

    await model.doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
      providerMetadata: {
        openai: {
          metadata: {
            custom: 'value',
          },
        },
      },
    });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      model: 'gpt-3.5-turbo',
      stream: true,
      stream_options: { include_usage: true },
      messages: [{ role: 'user', content: 'Hello' }],
      metadata: {
        custom: 'value',
      },
    });
  });

  describe('reasoning models', () => {
    it('should stream text delta', async () => {
      prepareStreamResponse({
        content: ['Hello, World!'],
        model: 'o1-preview',
      });

      const model = provider.chat('o1-preview');

      const { stream } = await model.doStream({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
      });

      expect(await convertReadableStreamToArray(stream)).toStrictEqual([
        {
          type: 'response-metadata',
          id: 'chatcmpl-96aZqmeDpA9IPD6tACY8djkMsJCMP',
          modelId: 'o1-preview',
          timestamp: expect.any(Date),
        },
        { type: 'text-delta', textDelta: '' },
        { type: 'text-delta', textDelta: 'Hello, World!' },
        {
          type: 'finish',
          finishReason: 'stop',
          usage: { promptTokens: 17, completionTokens: 227 },
          logprobs: undefined,
        },
      ]);
    });

    it('should send reasoning tokens', async () => {
      prepareStreamResponse({
        content: ['Hello, World!'],
        model: 'o1-preview',
        usage: {
          prompt_tokens: 15,
          completion_tokens: 20,
          total_tokens: 35,
          completion_tokens_details: {
            reasoning_tokens: 10,
          },
        },
      });

      const model = provider.chat('o1-preview');

      const { stream } = await model.doStream({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
      });

      expect(await convertReadableStreamToArray(stream)).toStrictEqual([
        {
          type: 'response-metadata',
          id: 'chatcmpl-96aZqmeDpA9IPD6tACY8djkMsJCMP',
          modelId: 'o1-preview',
          timestamp: expect.any(Date),
        },
        { type: 'text-delta', textDelta: '' },
        { type: 'text-delta', textDelta: 'Hello, World!' },
        {
          type: 'finish',
          finishReason: 'stop',
          usage: { promptTokens: 15, completionTokens: 20 },
          logprobs: undefined,
          providerMetadata: {
            openai: {
              reasoningTokens: 10,
            },
          },
        },
      ]);
    });
  });
});

describe('doStream simulated streaming', () => {
  const server = new JsonTestServer(
    'https://api.openai.com/v1/chat/completions',
  );

  server.setupTestEnvironment();

  function prepareJsonResponse({
    content = '',
    tool_calls,
    function_call,
    usage = {
      prompt_tokens: 4,
      total_tokens: 34,
      completion_tokens: 30,
    },
    logprobs = null,
    finish_reason = 'stop',
    id = 'chatcmpl-95ZTZkhr0mHNKqerQfiwkuox3PHAd',
    created = 1711115037,
    model = 'gpt-3.5-turbo-0125',
  }: {
    content?: string;
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
      completion_tokens_details?: {
        reasoning_tokens?: number;
      };
      prompt_tokens_details?: {
        cached_tokens?: number;
      };
    };
    logprobs?: {
      content:
        | {
            token: string;
            logprob: number;
            top_logprobs: { token: string; logprob: number }[];
          }[]
        | null;
    } | null;
    finish_reason?: string;
    created?: number;
    id?: string;
    model?: string;
  } = {}) {
    server.responseBodyJson = {
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
            function_call,
          },
          logprobs,
          finish_reason,
        },
      ],
      usage,
      system_fingerprint: 'fp_3bc1b5746c',
    };
  }

  it('should stream text delta', async () => {
    prepareJsonResponse({ content: 'Hello, World!', model: 'o1-preview' });
    const model = provider.chat('o1', {
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
        providerMetadata: undefined,
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

    const model = provider.chat('o1', {
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
        providerMetadata: undefined,
      },
    ]);
  });

  it('should send reasoning tokens', async () => {
    prepareJsonResponse({
      content: 'Hello, World!',
      model: 'o1-preview',
      usage: {
        prompt_tokens: 15,
        completion_tokens: 20,
        total_tokens: 35,
        completion_tokens_details: {
          reasoning_tokens: 10,
        },
      },
    });

    const model = provider.chat('o1', {
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
        usage: { promptTokens: 15, completionTokens: 20 },
        logprobs: undefined,
        providerMetadata: {
          openai: {
            reasoningTokens: 10,
          },
        },
      },
    ]);
  });
});
