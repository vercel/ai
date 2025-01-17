import { LanguageModelV1Prompt } from '@ai-sdk/provider';
import {
  JsonTestServer,
  StreamingTestServer,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { createCohere } from './cohere-provider';

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
});
const model = provider('command-r-plus');

describe('doGenerate', () => {
  const server = new JsonTestServer('https://api.cohere.com/v2/chat');

  server.setupTestEnvironment();

  function prepareJsonResponse({
    text = '',
    tool_plan = '',
    tool_calls,
    finish_reason = 'COMPLETE',
    tokens = {
      input_tokens: 4,
      output_tokens: 30,
    },
    generation_id = 'dad0c7cd-7982-42a7-acfb-706ccf598291',
  }: {
    text?: string;
    tool_plan?: string;
    tool_calls?: any;
    finish_reason?: string;
    tokens?: {
      input_tokens: number;
      output_tokens: number;
    };
    generation_id?: string;
  }) {
    server.responseBodyJson = {
      response_id: '0cf61ae0-1f60-4c18-9802-be7be809e712',
      generation_id,
      message: {
        role: 'assistant',
        content: [{ type: 'text', text }],
        ...(tool_calls ? { tool_calls } : {}),
      },
      finish_reason,
      usage: {
        billed_units: { input_tokens: 9, output_tokens: 415 },
        tokens,
      },
    };
    if (tool_plan) {
      server.responseBodyJson.message.tool_plan = tool_plan;
    }
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

  it('should extract tool plan', async () => {
    prepareJsonResponse({
      tool_plan: 'Looking up the stock price for AAPL.',
      tool_calls: [
        {
          id: 'test-id-1',
          type: 'function',
          function: {
            name: 'test-tool',
            arguments: '{"value":"example value"}',
          },
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

    expect(toolCalls).toStrictEqual([
      {
        toolCallId: 'test-id-1',
        toolCallType: 'function',
        toolName: 'test-tool',
        args: '{"value":"example value"}',
      },
    ]);
    expect(text).toStrictEqual('Looking up the stock price for AAPL.');
    expect(finishReason).toStrictEqual('stop');
  });

  it('should extract tool calls', async () => {
    prepareJsonResponse({
      text: 'Hello, World!',
      tool_calls: [
        {
          id: 'test-id-1',
          type: 'function',
          function: {
            name: 'test-tool',
            arguments: '{"value":"example value"}',
          },
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
        toolCallId: 'test-id-1',
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

  it('should send additional response information', async () => {
    prepareJsonResponse({
      generation_id: 'test-id',
    });

    const { response } = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(response).toStrictEqual({
      id: 'test-id',
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
      'content-length': '316',
      'content-type': 'application/json',

      // custom header
      'test-header': 'test-value',
    });
  });

  it('should pass model and messages', async () => {
    prepareJsonResponse({});

    await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      model: 'command-r-plus',
      messages: [
        { role: 'system', content: 'you are a friendly bot!' },
        { role: 'user', content: 'Hello' },
      ],
    });
  });

  describe('should pass tools', async () => {
    it('should support "none" tool choice', async () => {
      prepareJsonResponse({});

      await model.doGenerate({
        inputFormat: 'prompt',
        mode: {
          type: 'regular',
          toolChoice: {
            type: 'none',
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
        messages: [
          {
            role: 'system',
            content: 'you are a friendly bot!',
          },
          { role: 'user', content: 'Hello' },
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
      messages: [
        { role: 'system', content: 'you are a friendly bot!' },
        { role: 'user', content: 'Hello' },
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

  it('should send request body', async () => {
    prepareJsonResponse({ text: '' });

    const { request } = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(request).toStrictEqual({
      body: '{"model":"command-r-plus","messages":[{"role":"system","content":"you are a friendly bot!"},{"role":"user","content":"Hello"}]}',
    });
  });
});

describe('doStream', () => {
  const server = new StreamingTestServer('https://api.cohere.com/v2/chat');

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
      `event: message-start\ndata: {"type":"message-start","id":"586ac33f-9c64-452c-8f8d-e5890e73b6fb"}\n\n`,
      ...content.map(
        text =>
          `event: content-delta\ndata: {"type":"content-delta","delta":{"message":{"content":{"text":"${text}"}}}}\n\n`,
      ),
      `event: message-end\ndata: {"type":"message-end","delta":` +
        `{"finish_reason":"${finish_reason}",` +
        `"usage":{"tokens":{"input_tokens":${usage.input_tokens},"output_tokens":${usage.output_tokens}}}}}\n\n`,
      `data: [DONE]\n\n`,
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
      { type: 'response-metadata', id: '586ac33f-9c64-452c-8f8d-e5890e73b6fb' },
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
      `event: message-start\ndata: {"type":"message-start","id":"29f14a5a-11de-4cae-9800-25e4747408ea"}\n\n`,
      `event: tool-plan-delta\ndata: {"type":"tool-plan-delta","delta":{"message":{"tool_plan":"Looking up the stock price for AAPL."}}}\n\n`,
      `event: tool-call-start\ndata: {"type":"tool-call-start","delta":{"message":{"tool_calls":{"id":"test-id-1","type":"function","function":{"name":"test-tool","arguments":""}}}}}\n\n`,
      `event: tool-call-delta\ndata: {"type":"tool-call-delta","delta":{"message":{"tool_calls":{"function":{"arguments":"{\\n    \\""}}}}}\n\n`,
      `event: tool-call-delta\ndata: {"type":"tool-call-delta","delta":{"message":{"tool_calls":{"function":{"arguments":"ticker"}}}}}\n\n`,
      `event: tool-call-delta\ndata: {"type":"tool-call-delta","delta":{"message":{"tool_calls":{"function":{"arguments":"_"}}}}}\n\n`,
      `event: tool-call-delta\ndata: {"type":"tool-call-delta","delta":{"message":{"tool_calls":{"function":{"arguments":"symbol"}}}}}\n\n`,
      `event: tool-call-delta\ndata: {"type":"tool-call-delta","delta":{"message":{"tool_calls":{"function":{"arguments":"\\":"}}}}}\n\n`,
      `event: tool-call-delta\ndata: {"type":"tool-call-delta","delta":{"message":{"tool_calls":{"function":{"arguments":" \\""}}}}}\n\n`,
      `event: tool-call-delta\ndata: {"type":"tool-call-delta","delta":{"message":{"tool_calls":{"function":{"arguments":"AAPL"}}}}}\n\n`,
      `event: tool-call-delta\ndata: {"type":"tool-call-delta","delta":{"message":{"tool_calls":{"function":{"arguments":"\\""}}}}}\n\n`,
      `event: tool-call-delta\ndata: {"type":"tool-call-delta","delta":{"message":{"tool_calls":{"function":{"arguments":"\\n"}}}}}\n\n`,
      `event: tool-call-delta\ndata: {"type":"tool-call-delta","delta":{"message":{"tool_calls":{"function":{"arguments":"}"}}}}}\n\n`,
      `event: tool-call-end\ndata: {"type":"tool-call-end"}\n\n`,
      `event: message-end\ndata: {"type":"message-end","delta":{"finish_reason":"COMPLETE","usage":{"tokens":{"input_tokens":893,"output_tokens":62}}}}\n\n`,
      `data: [DONE]\n\n`,
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
      { type: 'response-metadata', id: '29f14a5a-11de-4cae-9800-25e4747408ea' },
      {
        type: 'text-delta',
        textDelta: 'Looking up the stock price for AAPL.',
      },
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

  it('should handle unparsable stream parts', async () => {
    server.responseChunks = [`event: foo-message\ndata: {unparsable}\n\n`];

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
      messages: [
        {
          role: 'system',
          content: 'you are a friendly bot!',
        },
        {
          role: 'user',
          content: 'Hello',
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

  it('should send request body', async () => {
    prepareStreamResponse({ content: [] });

    const { request } = await model.doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(request).toStrictEqual({
      body: '{"model":"command-r-plus","messages":[{"role":"system","content":"you are a friendly bot!"},{"role":"user","content":"Hello"}],"stream":true}',
    });
  });
});
