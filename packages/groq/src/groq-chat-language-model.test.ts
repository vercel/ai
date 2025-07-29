import { LanguageModelV2Prompt } from '@ai-sdk/provider';
import {
  convertReadableStreamToArray,
  createTestServer,
  isNodeVersion,
} from '@ai-sdk/provider-utils/test';
import { createGroq } from './groq-provider';

const TEST_PROMPT: LanguageModelV2Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const provider = createGroq({ apiKey: 'test-api-key' });
const model = provider('gemma2-9b-it');

const server = createTestServer({
  'https://api.groq.com/openai/v1/chat/completions': {},
});

describe('doGenerate', () => {
  function prepareJsonResponse({
    content = '',
    reasoning,
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
    model = 'gemma2-9b-it',
    headers,
  }: {
    content?: string;
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
    };
    finish_reason?: string;
    created?: number;
    id?: string;
    model?: string;
    headers?: Record<string, string>;
  } = {}) {
    server.urls['https://api.groq.com/openai/v1/chat/completions'].response = {
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

  it('should extract text', async () => {
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

  it('should extract reasoning', async () => {
    prepareJsonResponse({
      reasoning: 'This is a test reasoning',
    });

    const { content } = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(content).toMatchInlineSnapshot(`
      [
        {
          "text": "This is a test reasoning",
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

  it('should support partial usage', async () => {
    prepareJsonResponse({
      usage: { prompt_tokens: 20, total_tokens: 20 },
    });

    const { usage } = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(usage).toMatchInlineSnapshot(`
      {
        "inputTokens": 20,
        "outputTokens": undefined,
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
      headers: {
        'test-header': 'test-value',
      },
    });

    const { response } = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(response?.headers).toStrictEqual({
      // default headers:
      'content-length': '315',
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
      model: 'gemma2-9b-it',
      messages: [{ role: 'user', content: 'Hello' }],
    });
  });

  it('should pass provider options', async () => {
    prepareJsonResponse();

    await provider('gemma2-9b-it').doGenerate({
      prompt: TEST_PROMPT,
      providerOptions: {
        groq: {
          reasoningFormat: 'hidden',
          user: 'test-user-id',
          parallelToolCalls: false,
        },
      },
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      model: 'gemma2-9b-it',
      messages: [{ role: 'user', content: 'Hello' }],
      parallel_tool_calls: false,
      user: 'test-user-id',
      reasoning_format: 'hidden',
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
      model: 'gemma2-9b-it',
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

    const provider = createGroq({
      apiKey: 'test-api-key',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await provider('gemma2-9b-it').doGenerate({
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

  it('should pass response format information as json_schema when structuredOutputs enabled by default', async () => {
    prepareJsonResponse({ content: '{"value":"Spark"}' });

    const model = provider('gemma2-9b-it');

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
      model: 'gemma2-9b-it',
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

  it('should pass response format information as json_object when structuredOutputs explicitly disabled', async () => {
    prepareJsonResponse({ content: '{"value":"Spark"}' });

    const model = provider('gemma2-9b-it');

    const { warnings } = await model.doGenerate({
      providerOptions: {
        groq: {
          structuredOutputs: false,
        },
      },
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
      model: 'gemma2-9b-it',
      messages: [{ role: 'user', content: 'Hello' }],
      response_format: {
        type: 'json_object',
      },
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

  it('should use json_schema format when structuredOutputs explicitly enabled', async () => {
    prepareJsonResponse({ content: '{"value":"Spark"}' });

    const model = provider('gemma2-9b-it');

    await model.doGenerate({
      providerOptions: {
        groq: {
          structuredOutputs: true,
        },
      },
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
      model: 'gemma2-9b-it',
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

  it('should allow explicit structuredOutputs override', async () => {
    prepareJsonResponse({ content: '{"value":"Spark"}' });

    const model = provider('gemma2-9b-it');

    await model.doGenerate({
      providerOptions: {
        groq: {
          structuredOutputs: true,
        },
      },
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
      model: 'gemma2-9b-it',
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

  it('should handle structured outputs with Kimi K2 model', async () => {
    prepareJsonResponse({
      content:
        '{"recipe":{"name":"Spaghetti Aglio e Olio","ingredients":["spaghetti","garlic","olive oil","parmesan"],"instructions":["Boil pasta","Sauté garlic","Combine"]}}',
    });

    const kimiModel = provider('moonshotai/kimi-k2-instruct');

    const result = await kimiModel.doGenerate({
      providerOptions: {
        groq: {
          structuredOutputs: true,
        },
      },
      responseFormat: {
        type: 'json',
        name: 'recipe_response',
        description: 'A recipe with ingredients and instructions',
        schema: {
          type: 'object',
          properties: {
            recipe: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                ingredients: { type: 'array', items: { type: 'string' } },
                instructions: { type: 'array', items: { type: 'string' } },
              },
              required: ['name', 'ingredients', 'instructions'],
            },
          },
          required: ['recipe'],
          additionalProperties: false,
          $schema: 'http://json-schema.org/draft-07/schema#',
        },
      },
      prompt: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Generate a simple pasta recipe' }],
        },
      ],
    });

    expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
      {
        "messages": [
          {
            "content": "Generate a simple pasta recipe",
            "role": "user",
          },
        ],
        "model": "moonshotai/kimi-k2-instruct",
        "response_format": {
          "json_schema": {
            "description": "A recipe with ingredients and instructions",
            "name": "recipe_response",
            "schema": {
              "$schema": "http://json-schema.org/draft-07/schema#",
              "additionalProperties": false,
              "properties": {
                "recipe": {
                  "properties": {
                    "ingredients": {
                      "items": {
                        "type": "string",
                      },
                      "type": "array",
                    },
                    "instructions": {
                      "items": {
                        "type": "string",
                      },
                      "type": "array",
                    },
                    "name": {
                      "type": "string",
                    },
                  },
                  "required": [
                    "name",
                    "ingredients",
                    "instructions",
                  ],
                  "type": "object",
                },
              },
              "required": [
                "recipe",
              ],
              "type": "object",
            },
          },
          "type": "json_schema",
        },
      }
    `);

    expect(result.content).toMatchInlineSnapshot(`
      [
        {
          "text": "{"recipe":{"name":"Spaghetti Aglio e Olio","ingredients":["spaghetti","garlic","olive oil","parmesan"],"instructions":["Boil pasta","Sauté garlic","Combine"]}}",
          "type": "text",
        },
      ]
    `);
  });

  it('should include warnings when structured outputs explicitly disabled but schema provided', async () => {
    prepareJsonResponse({ content: '{"value":"test"}' });

    const { warnings } = await model.doGenerate({
      providerOptions: {
        groq: {
          structuredOutputs: false,
        },
      },
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

    expect(warnings).toMatchInlineSnapshot(`
      [
        {
          "details": "JSON response format schema is only supported with structuredOutputs",
          "setting": "responseFormat",
          "type": "unsupported-setting",
        },
      ]
    `);
  });

  it('should send request body', async () => {
    prepareJsonResponse({ content: '' });

    const { request } = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(request).toStrictEqual({
      body: '{"model":"gemma2-9b-it","messages":[{"role":"user","content":"Hello"}]}',
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
    server.urls['https://api.groq.com/openai/v1/chat/completions'].response = {
      type: 'stream-chunks',
      headers,
      chunks: [
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1702657020,"model":"gemma2-9b-it",` +
          `"system_fingerprint":null,"choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}\n\n`,
        ...content.map(text => {
          return (
            `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1702657020,"model":"gemma2-9b-it",` +
            `"system_fingerprint":null,"choices":[{"index":1,"delta":{"content":"${text}"},"finish_reason":null}]}\n\n`
          );
        }),
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1702657020,"model":"gemma2-9b-it",` +
          `"system_fingerprint":null,"choices":[{"index":0,"delta":{},"finish_reason":"${finish_reason}"}]}\n\n`,
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1729171479,"model":"gemma2-9b-it",` +
          `"system_fingerprint":"fp_10c08bf97d","choices":[{"index":0,"delta":{},"logprobs":null,"finish_reason":"${finish_reason}"}],` +
          `"x_groq":{"id":"req_01jadadp0femyae9kav1gpkhe8","usage":{"queue_time":0.061348671,"prompt_tokens":18,"prompt_time":0.000211569,` +
          `"completion_tokens":439,"completion_time":0.798181818,"total_tokens":457,"total_time":0.798393387}}}\n\n`,
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
          "modelId": "gemma2-9b-it",
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
          "type": "finish",
          "usage": {
            "inputTokens": 18,
            "outputTokens": 439,
            "totalTokens": 457,
          },
        },
      ]
    `);
  });

  it('should stream reasoning deltas', async () => {
    server.urls['https://api.groq.com/openai/v1/chat/completions'].response = {
      type: 'stream-chunks',
      chunks: [
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1702657020,"model":"gemma2-9b-it",` +
          `"system_fingerprint":null,"choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}\n\n`,
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1702657020,"model":"gemma2-9b-it",` +
          `"system_fingerprint":null,"choices":[{"index":1,"delta":{"reasoning":"I think,"},"finish_reason":null}]}\n\n`,
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1702657020,"model":"gemma2-9b-it",` +
          `"system_fingerprint":null,"choices":[{"index":1,"delta":{"reasoning":"therefore I am."},"finish_reason":null}]}\n\n`,
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1702657020,"model":"gemma2-9b-it",` +
          `"system_fingerprint":null,"choices":[{"index":1,"delta":{"content":"Hello"},"finish_reason":null}]}\n\n`,
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1702657020,"model":"gemma2-9b-it",` +
          `"system_fingerprint":null,"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n`,
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1729171479,"model":"gemma2-9b-it",` +
          `"system_fingerprint":"fp_10c08bf97d","choices":[{"index":0,"delta":{},"logprobs":null,"finish_reason":"stop"}],` +
          `"x_groq":{"id":"req_01jadadp0femyae9kav1gpkhe8","usage":{"queue_time":0.061348671,"prompt_tokens":18,"prompt_time":0.000211569,` +
          `"completion_tokens":439,"completion_time":0.798181818,"total_tokens":457,"total_time":0.798393387}}}\n\n`,
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
          "modelId": "gemma2-9b-it",
          "timestamp": 2023-12-15T16:17:00.000Z,
          "type": "response-metadata",
        },
        {
          "id": "reasoning-0",
          "type": "reasoning-start",
        },
        {
          "delta": "I think,",
          "id": "reasoning-0",
          "type": "reasoning-delta",
        },
        {
          "delta": "therefore I am.",
          "id": "reasoning-0",
          "type": "reasoning-delta",
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
          "id": "reasoning-0",
          "type": "reasoning-end",
        },
        {
          "id": "txt-0",
          "type": "text-end",
        },
        {
          "finishReason": "stop",
          "type": "finish",
          "usage": {
            "inputTokens": 18,
            "outputTokens": 439,
            "totalTokens": 457,
          },
        },
      ]
    `);
  });

  it('should stream tool deltas', async () => {
    server.urls['https://api.groq.com/openai/v1/chat/completions'].response = {
      type: 'stream-chunks',
      chunks: [
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"gemma2-9b-it",` +
          `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"role":"assistant","content":null,` +
          `"tool_calls":[{"index":0,"id":"call_O17Uplv4lJvD6DVdIvFFeRMw","type":"function","function":{"name":"test-tool","arguments":""}}]},` +
          `"finish_reason":null}]}\n\n`,
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"gemma2-9b-it",` +
          `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\""}}]},` +
          `"finish_reason":null}]}\n\n`,
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"gemma2-9b-it",` +
          `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"value"}}]},` +
          `"finish_reason":null}]}\n\n`,
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"gemma2-9b-it",` +
          `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\":\\""}}]},` +
          `"finish_reason":null}]}\n\n`,
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"gemma2-9b-it",` +
          `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"Spark"}}]},` +
          `"finish_reason":null}]}\n\n`,
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"gemma2-9b-it",` +
          `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"le"}}]},` +
          `"finish_reason":null}]}\n\n`,
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"gemma2-9b-it",` +
          `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":" Day"}}]},` +
          `"finish_reason":null}]}\n\n`,
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"gemma2-9b-it",` +
          `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"}"}}]},` +
          `"finish_reason":null}]}\n\n`,
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1729171479,"model":"gemma2-9b-it",` +
          `"system_fingerprint":"fp_10c08bf97d","choices":[{"index":0,"delta":{},"logprobs":null,"finish_reason":"tool_calls"}],` +
          `"x_groq":{"id":"req_01jadadp0femyae9kav1gpkhe8","usage":{"queue_time":0.061348671,"prompt_tokens":18,"prompt_time":0.000211569,` +
          `"completion_tokens":439,"completion_time":0.798181818,"total_tokens":457,"total_time":0.798393387}}}\n\n`,
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
          "modelId": "gemma2-9b-it",
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
          "type": "finish",
          "usage": {
            "inputTokens": 18,
            "outputTokens": 439,
            "totalTokens": 457,
          },
        },
      ]
    `);
  });

  it('should stream tool call deltas when tool call arguments are passed in the first chunk', async () => {
    server.urls['https://api.groq.com/openai/v1/chat/completions'].response = {
      type: 'stream-chunks',
      chunks: [
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"gemma2-9b-it",` +
          `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"role":"assistant","content":null,` +
          `"tool_calls":[{"index":0,"id":"call_O17Uplv4lJvD6DVdIvFFeRMw","type":"function","function":{"name":"test-tool","arguments":"{\\""}}]},` +
          `"finish_reason":null}]}\n\n`,
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"gemma2-9b-it",` +
          `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"va"}}]},` +
          `"finish_reason":null}]}\n\n`,
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"gemma2-9b-it",` +
          `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"lue"}}]},` +
          `"finish_reason":null}]}\n\n`,
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"gemma2-9b-it",` +
          `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\":\\""}}]},` +
          `"finish_reason":null}]}\n\n`,
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"gemma2-9b-it",` +
          `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"Spark"}}]},` +
          `"finish_reason":null}]}\n\n`,
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"gemma2-9b-it",` +
          `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"le"}}]},` +
          `"finish_reason":null}]}\n\n`,
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"gemma2-9b-it",` +
          `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":" Day"}}]},` +
          `"finish_reason":null}]}\n\n`,
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"gemma2-9b-it",` +
          `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"}"}}]},` +
          `"finish_reason":null}]}\n\n`,
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1729171479,"model":"gemma2-9b-it",` +
          `"system_fingerprint":"fp_10c08bf97d","choices":[{"index":0,"delta":{},"logprobs":null,"finish_reason":"tool_calls"}],` +
          `"x_groq":{"id":"req_01jadadp0femyae9kav1gpkhe8","usage":{"queue_time":0.061348671,"prompt_tokens":18,"prompt_time":0.000211569,` +
          `"completion_tokens":439,"completion_time":0.798181818,"total_tokens":457,"total_time":0.798393387}}}\n\n`,
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
          "modelId": "gemma2-9b-it",
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
          "type": "finish",
          "usage": {
            "inputTokens": 18,
            "outputTokens": 439,
            "totalTokens": 457,
          },
        },
      ]
    `);
  });

  it('should not duplicate tool calls when there is an additional empty chunk after the tool call has been completed', async () => {
    server.urls['https://api.groq.com/openai/v1/chat/completions'].response = {
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

  it('should stream tool call that is sent in one chunk', async () => {
    server.urls['https://api.groq.com/openai/v1/chat/completions'].response = {
      type: 'stream-chunks',
      chunks: [
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"gemma2-9b-it",` +
          `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"role":"assistant","content":null,` +
          `"tool_calls":[{"index":0,"id":"call_O17Uplv4lJvD6DVdIvFFeRMw","type":"function","function":{"name":"test-tool","arguments":"{\\"value\\":\\"Sparkle Day\\"}"}}]},` +
          `"finish_reason":null}]}\n\n`,
        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1729171479,"model":"gemma2-9b-it",` +
          `"system_fingerprint":"fp_10c08bf97d","choices":[{"index":0,"delta":{},"logprobs":null,"finish_reason":"tool_calls"}],` +
          `"x_groq":{"id":"req_01jadadp0femyae9kav1gpkhe8","usage":{"queue_time":0.061348671,"prompt_tokens":18,"prompt_time":0.000211569,` +
          `"completion_tokens":439,"completion_time":0.798181818,"total_tokens":457,"total_time":0.798393387}}}\n\n`,
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
          "modelId": "gemma2-9b-it",
          "timestamp": 2024-03-25T09:06:38.000Z,
          "type": "response-metadata",
        },
        {
          "id": "call_O17Uplv4lJvD6DVdIvFFeRMw",
          "toolName": "test-tool",
          "type": "tool-input-start",
        },
        {
          "delta": "{"value":"Sparkle Day"}",
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
          "type": "finish",
          "usage": {
            "inputTokens": 18,
            "outputTokens": 439,
            "totalTokens": 457,
          },
        },
      ]
    `);
  });

  it('should handle error stream parts', async () => {
    server.urls['https://api.groq.com/openai/v1/chat/completions'].response = {
      type: 'stream-chunks',
      chunks: [
        `data: {"error":{"message": "The server had an error processing your request. Sorry about that!","type":"invalid_request_error"}}\n\n`,
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
            "message": "The server had an error processing your request. Sorry about that!",
            "type": "invalid_request_error",
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
      server.urls['https://api.groq.com/openai/v1/chat/completions'].response =
        {
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

  it('should expose the raw response headers', async () => {
    prepareStreamResponse({
      headers: {
        'test-header': 'test-value',
      },
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
      model: 'gemma2-9b-it',
      messages: [{ role: 'user', content: 'Hello' }],
    });
  });

  it('should pass headers', async () => {
    prepareStreamResponse({ content: [] });

    const provider = createGroq({
      apiKey: 'test-api-key',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await provider('gemma2-9b-it').doStream({
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

    expect(request).toStrictEqual({
      body: '{"model":"gemma2-9b-it","messages":[{"role":"user","content":"Hello"}],"stream":true}',
    });
  });
});

describe('doStream with raw chunks', () => {
  it('should stream raw chunks when includeRawChunks is true', async () => {
    server.urls['https://api.groq.com/openai/v1/chat/completions'].response = {
      type: 'stream-chunks',
      chunks: [
        `data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gemma2-9b-it","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}\n\n`,
        `data: {"id":"chatcmpl-456","object":"chat.completion.chunk","created":1234567890,"model":"gemma2-9b-it","choices":[{"index":0,"delta":{"content":" world"},"finish_reason":null}]}\n\n`,
        `data: {"id":"chatcmpl-789","object":"chat.completion.chunk","created":1234567890,"model":"gemma2-9b-it","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"x_groq":{"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}}\n\n`,
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
                },
                "finish_reason": null,
                "index": 0,
              },
            ],
            "created": 1234567890,
            "id": "chatcmpl-123",
            "model": "gemma2-9b-it",
            "object": "chat.completion.chunk",
          },
          "type": "raw",
        },
        {
          "id": "chatcmpl-123",
          "modelId": "gemma2-9b-it",
          "timestamp": 2009-02-13T23:31:30.000Z,
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
                "delta": {
                  "content": " world",
                },
                "finish_reason": null,
                "index": 0,
              },
            ],
            "created": 1234567890,
            "id": "chatcmpl-456",
            "model": "gemma2-9b-it",
            "object": "chat.completion.chunk",
          },
          "type": "raw",
        },
        {
          "delta": " world",
          "id": "txt-0",
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
            "created": 1234567890,
            "id": "chatcmpl-789",
            "model": "gemma2-9b-it",
            "object": "chat.completion.chunk",
            "x_groq": {
              "usage": {
                "completion_tokens": 5,
                "prompt_tokens": 10,
                "total_tokens": 15,
              },
            },
          },
          "type": "raw",
        },
        {
          "id": "txt-0",
          "type": "text-end",
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
