import { LanguageModelV1Prompt } from '@ai-sdk/provider';
import {
  JsonTestServer,
  StreamingTestServer,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { createCohere } from './cohere-provider';
import { fail } from 'assert';

const TEST_PROMPT: LanguageModelV1Prompt = [
  {
    role: 'system',
    content: 'you are a friendly bot!',
  },
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

let testIdCounter = 0;

const provider = createCohere({
  apiKey: 'test-api-key',
  generateId: () => {
    return `test-id-${testIdCounter++}`;
  },
});
const model = provider('command-r-plus');

describe('doGenerate', () => {
  const server = new JsonTestServer('https://api.cohere.com/v1/chat');

  server.setupTestEnvironment();

  function prepareJsonResponse({
    input = '',
    text = '',
    tool_calls,
    finish_reason = 'COMPLETE',
    tokens = {
      input_tokens: 4,
      output_tokens: 30,
    },
  }: {
    input?: string;
    text?: string;
    tool_calls?: any;
    finish_reason?: string;
    tokens?: {
      input_tokens: number;
      output_tokens: number;
    };
  }) {
    server.responseBodyJson = {
      response_id: '0cf61ae0-1f60-4c18-9802-be7be809e712',
      text,
      generation_id: 'dad0c7cd-7982-42a7-acfb-706ccf598291',
      chat_history: [
        { role: 'USER', message: input },
        { role: 'CHATBOT', message: text },
      ],
      ...(tool_calls ? { tool_calls } : {}),
      finish_reason,
      meta: {
        api_version: { version: '1' },
        billed_units: { input_tokens: 9, output_tokens: 415 },
        tokens,
      },
    };
  }

  it('should extract text response', async () => {
    prepareJsonResponse({ text: 'Hello, World!' });

    const { text } = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(text).toStrictEqual('Hello, World!');
  });

  it('should extract tool calls', async () => {
    prepareJsonResponse({
      text: 'Hello, World!',
      tool_calls: [
        {
          name: 'test-tool',
          parameters: { value: 'example value' },
        },
      ],
    });

    const { text, toolCalls, finishReason } = await model.doGenerate({
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

    expect(toolCalls).toStrictEqual([
      {
        toolCallId: expect.any(String),
        toolCallType: 'function',
        toolName: 'test-tool',
        args: '{"value":"example value"}',
      },
    ]);
    expect(text).toStrictEqual('Hello, World!');
    expect(finishReason).toStrictEqual('stop');
  });

  it('should extract usage', async () => {
    prepareJsonResponse({
      tokens: { input_tokens: 20, output_tokens: 5 },
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

  it('should extract finish reason', async () => {
    prepareJsonResponse({
      finish_reason: 'MAX_TOKENS',
    });

    const { finishReason } = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(finishReason).toStrictEqual('length');
  });

  it('should expose the raw response headers', async () => {
    prepareJsonResponse({});

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
      'content-length': '364',
      'content-type': 'application/json',

      // custom header
      'test-header': 'test-value',
    });
  });

  it('should pass model, message, and chat history', async () => {
    prepareJsonResponse({});

    await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      model: 'command-r-plus',
      message: 'Hello',
      chat_history: [{ role: 'SYSTEM', message: 'you are a friendly bot!' }],
    });
  });

  describe('should pass tools', async () => {
    it('should convert primitive types', async () => {
      prepareJsonResponse({});

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
                properties: {
                  value_a: { type: 'string' },
                  value_b: { type: 'number' },
                  value_c: { type: 'integer' },
                  value_d: { type: 'boolean' },
                },
                required: ['value_a'],
                additionalProperties: false,
                $schema: 'http://json-schema.org/draft-07/schema#',
              },
            },
          ],
        },
        prompt: TEST_PROMPT,
      });

      expect(await server.getRequestBodyJson()).toStrictEqual({
        model: 'command-r-plus',
        chat_history: [
          {
            role: 'SYSTEM',
            message: 'you are a friendly bot!',
          },
        ],
        force_single_step: false,
        message: 'Hello',
        tools: [
          {
            name: 'test-tool',
            parameterDefinitions: {
              value_a: {
                type: 'str',
                required: true,
              },
              value_b: {
                type: 'float',
                required: false,
              },
              value_c: {
                type: 'int',
                required: false,
              },
              value_d: {
                type: 'bool',
                required: false,
              },
            },
          },
        ],
      });
    });

    it('should throw error for unsupported types', async () => {
      prepareJsonResponse({});

      await expect(
        model.doGenerate({
          inputFormat: 'prompt',
          mode: {
            type: 'regular',
            tools: [
              {
                type: 'function',
                name: 'test-tool',
                parameters: {
                  type: 'object',
                  properties: {
                    value: { type: 'array', items: { type: 'string' } },
                  },
                  required: ['value'],
                  additionalProperties: false,
                  $schema: 'http://json-schema.org/draft-07/schema#',
                },
              },
            ],
          },
          prompt: TEST_PROMPT,
        }),
      ).rejects.toThrow();
    });

    it('should pass tool choice', async () => {
      prepareJsonResponse({});

      await model.doGenerate({
        inputFormat: 'prompt',
        mode: {
          type: 'regular',
          toolChoice: {
            type: 'required',
          },
          tools: [
            {
              type: 'function',
              name: 'test-tool',
              parameters: {
                type: 'object',
                properties: {
                  value: { type: 'string' },
                },
                required: ['value'],
                additionalProperties: false,
                $schema: 'http://json-schema.org/draft-07/schema#',
              },
            },
          ],
        },
        prompt: TEST_PROMPT,
      });

      expect(await server.getRequestBodyJson()).toStrictEqual({
        model: 'command-r-plus',
        chat_history: [
          {
            role: 'SYSTEM',
            message: 'you are a friendly bot!',
          },
        ],
        force_single_step: true,
        message: 'Hello',
        tools: [
          {
            name: 'test-tool',
            parameterDefinitions: {
              value: {
                type: 'str',
                required: true,
              },
            },
          },
        ],
      });
    });
  });

  it('should pass headers', async () => {
    prepareJsonResponse({});

    const provider = createCohere({
      apiKey: 'test-api-key',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await provider('command-r-plus').doGenerate({
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
    });
  });

  it('should pass response format', async () => {
    prepareJsonResponse({});

    await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
      responseFormat: {
        type: 'json',
        schema: {
          type: 'object',
          properties: {
            text: { type: 'string' },
          },
          required: ['text'],
        },
      },
    });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      model: 'command-r-plus',
      message: 'Hello',
      chat_history: [
        {
          role: 'SYSTEM',
          message: 'you are a friendly bot!',
        },
      ],
      response_format: {
        type: 'json_object',
        schema: {
          type: 'object',
          properties: {
            text: { type: 'string' },
          },
          required: ['text'],
        },
      },
    });
  });
});

describe('doStream', () => {
  const server = new StreamingTestServer('https://api.cohere.com/v1/chat');

  server.setupTestEnvironment();

  function prepareStreamResponse({
    content,
    usage = {
      input_tokens: 17,
      output_tokens: 244,
    },
    finish_reason = 'COMPLETE',
  }: {
    content: string[];
    usage?: {
      input_tokens: number;
      output_tokens: number;
    };
    finish_reason?: string;
  }) {
    server.responseChunks = [
      `{"is_finished":false,"event_type":"stream-start","generation_id":"586ac33f-9c64-452c-8f8d-e5890e73b6fb"}\n`,
      ...content.map(
        text =>
          `{"is_finished":false,"event_type":"text-generation","text":"${text}"}\n`,
      ),
      `{"is_finished":true,"event_type":"stream-end","response":` +
        `{"response_id":"ac6d5f86-f5a7-4db9-bacf-f01b98697a5b",` +
        `"text":"${content.join('')}",` +
        `"generation_id":"586ac33f-9c64-452c-8f8d-e5890e73b6fb",` +
        `"chat_history":[{"role":"USER","message":"Invent a new holiday and describe its traditions."},` +
        `{"role":"CHATBOT","message":"${content.join('')}"}],` +
        `"finish_reason":"${finish_reason}","meta":{"api_version":{"version":"1"},` +
        `"billed_units":{"input_tokens":9,"output_tokens":20},` +
        `"tokens":${JSON.stringify(
          usage,
        )}}},"finish_reason":"${finish_reason}"}\n`,
    ];
  }

  it('should stream text deltas', async () => {
    prepareStreamResponse({
      content: ['Hello', ', ', 'World!'],
      finish_reason: 'COMPLETE',
      usage: {
        input_tokens: 34,
        output_tokens: 12,
      },
    });

    const { stream } = await model.doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    // note: space moved to last chunk bc of trimming
    expect(await convertReadableStreamToArray(stream)).toStrictEqual([
      { type: 'text-delta', textDelta: 'Hello' },
      { type: 'text-delta', textDelta: ', ' },
      { type: 'text-delta', textDelta: 'World!' },
      {
        type: 'finish',
        finishReason: 'stop',
        usage: { promptTokens: 34, completionTokens: 12 },
      },
    ]);
  });

  it('should stream tool deltas', async () => {
    server.responseChunks = [
      `{"event_type":"stream-start"}\n\n`,
      `{"event_type":"tool-calls-chunk","text":"I"}\n\n`,
      `{"event_type":"tool-calls-chunk","text":" will"}\n\n`,
      `{"event_type":"tool-calls-chunk","text":" use"}\n\n`,
      `{"event_type":"tool-calls-chunk","text":" the"}\n\n`,
      `{"event_type":"tool-calls-chunk","text":" get"}\n\n`,
      `{"event_type":"tool-calls-chunk","text":"Stock"}\n\n`,
      `{"event_type":"tool-calls-chunk","text":"Price"}\n\n`,
      `{"event_type":"tool-calls-chunk","text":" tool"}\n\n`,
      `{"event_type":"tool-calls-chunk","text":" to"}\n\n`,
      `{"event_type":"tool-calls-chunk","text":" find"}\n\n`,
      `{"event_type":"tool-calls-chunk","text":" the"}\n\n`,
      `{"event_type":"tool-calls-chunk","text":" price"}\n\n`,
      `{"event_type":"tool-calls-chunk","text":" of"}\n\n`,
      `{"event_type":"tool-calls-chunk","text":" AAPL"}\n\n`,
      `{"event_type":"tool-calls-chunk","text":" stock"}\n\n`,
      `{"event_type":"tool-calls-chunk","text":"."}\n\n`,
      `{"event_type":"tool-calls-chunk","tool_call_delta":{"index":0,"name":"test-tool"}}\n\n`,
      `{"event_type":"tool-calls-chunk","tool_call_delta":{"index":0,"parameters":"{\\n    \\""}}\n\n`,
      `{"event_type":"tool-calls-chunk","tool_call_delta":{"index":0,"parameters":"ticker"}}\n\n`,
      `{"event_type":"tool-calls-chunk","tool_call_delta":{"index":0,"parameters":"_"}}\n\n`,
      `{"event_type":"tool-calls-chunk","tool_call_delta":{"index":0,"parameters":"symbol"}}\n\n`,
      `{"event_type":"tool-calls-chunk","tool_call_delta":{"index":0,"parameters":"\\":"}}\n\n`,
      `{"event_type":"tool-calls-chunk","tool_call_delta":{"index":0,"parameters":" \\""}}\n\n`,
      `{"event_type":"tool-calls-chunk","tool_call_delta":{"index":0,"parameters":"AAPL"}}\n\n`,
      `{"event_type":"tool-calls-chunk","tool_call_delta":{"index":0,"parameters":"\\""}}\n\n`,
      `{"event_type":"tool-calls-chunk","tool_call_delta":{"index":0,"parameters":"\\n"}}\n\n`,
      `{"event_type":"tool-calls-chunk","tool_call_delta":{"index":0,"parameters":"}"}}\n\n`,
      `{"event_type":"tool-calls-generation","tool_calls":[{"name":"test-tool-a","parameters":{"ticker_symbol":"AAPL"}}]}\n\n`,
      `{"event_type":"stream-end","finish_reason":"COMPLETE","response":{"meta":{"tokens":{"input_tokens":893,"output_tokens":62}}}}\n\n`,
    ];

    const { stream } = await model.doStream({
      inputFormat: 'prompt',
      prompt: TEST_PROMPT,
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
    });

    const responseArray = await convertReadableStreamToArray(stream);

    expect(responseArray).toStrictEqual([
      {
        type: 'tool-call-delta',
        toolCallType: 'function',
        toolCallId: 'test-id-1',
        toolName: 'test-tool',
        argsTextDelta: '',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'test-id-1',
        toolCallType: 'function',
        toolName: 'test-tool',
        argsTextDelta: '{\n    "',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'test-id-1',
        toolCallType: 'function',
        toolName: 'test-tool',
        argsTextDelta: 'ticker',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'test-id-1',
        toolCallType: 'function',
        toolName: 'test-tool',
        argsTextDelta: '_',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'test-id-1',
        toolCallType: 'function',
        toolName: 'test-tool',
        argsTextDelta: 'symbol',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'test-id-1',
        toolCallType: 'function',
        toolName: 'test-tool',
        argsTextDelta: '":',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'test-id-1',
        toolCallType: 'function',
        toolName: 'test-tool',
        argsTextDelta: ' "',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'test-id-1',
        toolCallType: 'function',
        toolName: 'test-tool',
        argsTextDelta: 'AAPL',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'test-id-1',
        toolCallType: 'function',
        toolName: 'test-tool',
        argsTextDelta: '"',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'test-id-1',
        toolCallType: 'function',
        toolName: 'test-tool',
        argsTextDelta: '\n',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'test-id-1',
        toolCallType: 'function',
        toolName: 'test-tool',
        argsTextDelta: '}',
      },
      {
        type: 'tool-call',
        toolCallId: 'test-id-1',
        toolCallType: 'function',
        toolName: 'test-tool',
        args: '{"ticker_symbol":"AAPL"}',
      },
      {
        finishReason: 'stop',
        type: 'finish',
        usage: {
          completionTokens: 62,
          promptTokens: 893,
        },
      },
    ]);

    // Check if the tool call ID is the same in the tool call delta and the tool call
    const toolCallIds = responseArray
      .filter(
        chunk => chunk.type === 'tool-call-delta' || chunk.type === 'tool-call',
      )
      .map(chunk => chunk.toolCallId);

    expect(new Set(toolCallIds)).toStrictEqual(new Set(['test-id-1']));
  });

  it('should handle out of order tool deltas', async () => {
    server.responseChunks = [
      `{"event_type":"stream-start"}\n\n`,
      `{"event_type":"tool-calls-chunk","tool_call_delta":{"index":0,"name":"test-tool-a"}}\n\n`,
      `{"event_type":"tool-calls-chunk","tool_call_delta":{"index":1,"name":"test-tool-b"}}\n\n`,
      `{"event_type":"tool-calls-chunk","tool_call_delta":{"index":0,"parameters":"{\\n    \\""}}\n\n`,
      `{"event_type":"tool-calls-chunk","tool_call_delta":{"index":1,"parameters":"{\\n    \\""}}\n\n`,
      `{"event_type":"tool-calls-chunk","tool_call_delta":{"index":0,"parameters":"ticker"}}\n\n`,
      `{"event_type":"tool-calls-chunk","tool_call_delta":{"index":1,"parameters":"ticker"}}\n\n`,
      `{"event_type":"tool-calls-chunk","tool_call_delta":{"index":0,"parameters":"_"}}\n\n`,
      `{"event_type":"tool-calls-chunk","tool_call_delta":{"index":1,"parameters":"_"}}\n\n`,
      `{"event_type":"tool-calls-chunk","tool_call_delta":{"index":0,"parameters":"symbol"}}\n\n`,
      `{"event_type":"tool-calls-chunk","tool_call_delta":{"index":1,"parameters":"symbol"}}\n\n`,
      `{"event_type":"tool-calls-chunk","tool_call_delta":{"index":0,"parameters":"\\":"}}\n\n`,
      `{"event_type":"tool-calls-chunk","tool_call_delta":{"index":1,"parameters":"\\":"}}\n\n`,
      `{"event_type":"tool-calls-chunk","tool_call_delta":{"index":0,"parameters":" \\""}}\n\n`,
      `{"event_type":"tool-calls-chunk","tool_call_delta":{"index":1,"parameters":" \\""}}\n\n`,
      `{"event_type":"tool-calls-chunk","tool_call_delta":{"index":1,"parameters":"TSLA"}}\n\n`,
      `{"event_type":"tool-calls-chunk","tool_call_delta":{"index":0,"parameters":"AAPL"}}\n\n`,
      `{"event_type":"tool-calls-chunk","tool_call_delta":{"index":0,"parameters":"\\""}}\n\n`,
      `{"event_type":"tool-calls-chunk","tool_call_delta":{"index":1,"parameters":"\\""}}\n\n`,
      `{"event_type":"tool-calls-chunk","tool_call_delta":{"index":0,"parameters":"\\n"}}\n\n`,
      `{"event_type":"tool-calls-chunk","tool_call_delta":{"index":1,"parameters":"\\n"}}\n\n`,
      `{"event_type":"tool-calls-chunk","tool_call_delta":{"index":0,"parameters":"}"}}\n\n`,
      `{"event_type":"tool-calls-chunk","tool_call_delta":{"index":1,"parameters":"}"}}\n\n`,
      `{"event_type":"tool-calls-generation","tool_calls":[{"name":"test-tool-a","parameters":{"ticker_symbol":"AAPL"}},{"name":"test-tool-b","parameters":{"ticker_symbol":"TSLA"}}]}\n\n`,
      `{"event_type":"stream-end","finish_reason":"COMPLETE","response":{"meta":{"tokens":{"input_tokens":893,"output_tokens":62}}}}\n\n`,
    ];

    const { stream } = await model.doStream({
      inputFormat: 'prompt',
      prompt: TEST_PROMPT,
      mode: {
        type: 'regular',
        tools: [
          {
            type: 'function',
            name: 'test-tool-a',
            parameters: {
              type: 'object',
              properties: { value: { type: 'string' } },
              required: ['value'],
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
          {
            type: 'function',
            name: 'test-tool-b',
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
    });

    const responseArray = await convertReadableStreamToArray(stream);

    expect(responseArray).toStrictEqual([
      {
        type: 'tool-call-delta',
        toolCallType: 'function',
        toolCallId: 'test-id-2',
        toolName: 'test-tool-a',
        argsTextDelta: '',
      },
      {
        type: 'tool-call-delta',
        toolCallType: 'function',
        toolCallId: 'test-id-3',
        toolName: 'test-tool-b',
        argsTextDelta: '',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'test-id-2',
        toolCallType: 'function',
        toolName: 'test-tool-a',
        argsTextDelta: '{\n    "',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'test-id-3',
        toolCallType: 'function',
        toolName: 'test-tool-b',
        argsTextDelta: '{\n    "',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'test-id-2',
        toolCallType: 'function',
        toolName: 'test-tool-a',
        argsTextDelta: 'ticker',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'test-id-3',
        toolCallType: 'function',
        toolName: 'test-tool-b',
        argsTextDelta: 'ticker',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'test-id-2',
        toolCallType: 'function',
        toolName: 'test-tool-a',
        argsTextDelta: '_',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'test-id-3',
        toolCallType: 'function',
        toolName: 'test-tool-b',
        argsTextDelta: '_',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'test-id-2',
        toolCallType: 'function',
        toolName: 'test-tool-a',
        argsTextDelta: 'symbol',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'test-id-3',
        toolCallType: 'function',
        toolName: 'test-tool-b',
        argsTextDelta: 'symbol',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'test-id-2',
        toolCallType: 'function',
        toolName: 'test-tool-a',
        argsTextDelta: '":',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'test-id-3',
        toolCallType: 'function',
        toolName: 'test-tool-b',
        argsTextDelta: '":',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'test-id-2',
        toolCallType: 'function',
        toolName: 'test-tool-a',
        argsTextDelta: ' "',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'test-id-3',
        toolCallType: 'function',
        toolName: 'test-tool-b',
        argsTextDelta: ' "',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'test-id-3',
        toolCallType: 'function',
        toolName: 'test-tool-b',
        argsTextDelta: 'TSLA',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'test-id-2',
        toolCallType: 'function',
        toolName: 'test-tool-a',
        argsTextDelta: 'AAPL',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'test-id-2',
        toolCallType: 'function',
        toolName: 'test-tool-a',
        argsTextDelta: '"',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'test-id-3',
        toolCallType: 'function',
        toolName: 'test-tool-b',
        argsTextDelta: '"',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'test-id-2',
        toolCallType: 'function',
        toolName: 'test-tool-a',
        argsTextDelta: '\n',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'test-id-3',
        toolCallType: 'function',
        toolName: 'test-tool-b',
        argsTextDelta: '\n',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'test-id-2',
        toolCallType: 'function',
        toolName: 'test-tool-a',
        argsTextDelta: '}',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'test-id-3',
        toolCallType: 'function',
        toolName: 'test-tool-b',
        argsTextDelta: '}',
      },
      {
        type: 'tool-call',
        toolCallId: 'test-id-2',
        toolCallType: 'function',
        toolName: 'test-tool-a',
        args: '{"ticker_symbol":"AAPL"}',
      },
      {
        type: 'tool-call',
        toolCallId: 'test-id-3',
        toolCallType: 'function',
        toolName: 'test-tool-b',
        args: '{"ticker_symbol":"TSLA"}',
      },
      {
        finishReason: 'stop',
        type: 'finish',
        usage: {
          completionTokens: 62,
          promptTokens: 893,
        },
      },
    ]);

    // Check if the tool call ID is the same in the tool call delta and the tool call
    const toolCallIds = responseArray
      .filter(
        chunk => chunk.type === 'tool-call-delta' || chunk.type === 'tool-call',
      )
      .map(chunk => chunk.toolCallId);

    expect(new Set(toolCallIds)).toStrictEqual(
      new Set(['test-id-2', 'test-id-3']),
    );
  });

  it('should handle unparsable stream parts', async () => {
    server.responseChunks = [`{unparsable}\n`];

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
      model: 'command-r-plus',
      message: 'Hello',
      chat_history: [
        {
          role: 'SYSTEM',
          message: 'you are a friendly bot!',
        },
      ],
    });
  });

  it('should pass headers', async () => {
    prepareStreamResponse({ content: [] });

    const provider = createCohere({
      apiKey: 'test-api-key',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await provider('command-r-plus').doStream({
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
    });
  });
});
