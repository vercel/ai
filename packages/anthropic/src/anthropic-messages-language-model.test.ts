import { LanguageModelV1Prompt } from '@ai-sdk/provider';
import {
  JsonTestServer,
  StreamingTestServer,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { AnthropicAssistantMessage } from './anthropic-api-types';
import { createAnthropic } from './anthropic-provider';

const TEST_PROMPT: LanguageModelV1Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const provider = createAnthropic({ apiKey: 'test-api-key' });
const model = provider('claude-3-haiku-20240307');

describe('doGenerate', () => {
  const server = new JsonTestServer('https://api.anthropic.com/v1/messages');

  server.setupTestEnvironment();

  function prepareJsonResponse({
    content = [{ type: 'text', text: '', cache_control: undefined }],
    usage = {
      input_tokens: 4,
      output_tokens: 30,
    },
    stopReason = 'end_turn',
    id = 'msg_017TfcQ4AgGxKyBduUpqYPZn',
    model = 'claude-3-haiku-20240307',
  }: {
    content?: AnthropicAssistantMessage['content'];
    usage?: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
    stopReason?: string;
    id?: string;
    model?: string;
  }) {
    server.responseBodyJson = {
      id,
      type: 'message',
      role: 'assistant',
      content,
      model,
      stop_reason: stopReason,
      stop_sequence: null,
      usage,
    };
  }

  it('should extract text response', async () => {
    prepareJsonResponse({
      content: [
        { type: 'text', text: 'Hello, World!', cache_control: undefined },
      ],
    });

    const { text } = await provider('claude-3-haiku-20240307').doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(text).toStrictEqual('Hello, World!');
  });

  it('should extract tool calls', async () => {
    prepareJsonResponse({
      content: [
        {
          type: 'text',
          text: 'Some text\n\n',
          cache_control: undefined,
        },
        {
          type: 'tool_use',
          id: 'toolu_1',
          name: 'test-tool',
          input: { value: 'example value' },
          cache_control: undefined,
        },
      ],
      stopReason: 'tool_use',
    });

    const { toolCalls, finishReason, text } = await model.doGenerate({
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
        toolCallId: 'toolu_1',
        toolCallType: 'function',
        toolName: 'test-tool',
        args: '{"value":"example value"}',
      },
    ]);
    expect(text).toStrictEqual('Some text\n\n');
    expect(finishReason).toStrictEqual('tool-calls');
  });

  it('should support object-tool mode', async () => {
    prepareJsonResponse({
      content: [
        {
          type: 'text',
          text: 'Some text\n\n',
          cache_control: undefined,
        },
        {
          type: 'tool_use',
          id: 'toolu_1',
          name: 'json',
          input: { value: 'example value' },
          cache_control: undefined,
        },
      ],
      stopReason: 'tool_use',
    });

    const { toolCalls, finishReason } = await model.doGenerate({
      inputFormat: 'prompt',
      mode: {
        type: 'object-tool',
        tool: {
          type: 'function',
          name: 'json',
          description: 'Respond with a JSON object.',
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

    expect(toolCalls).toStrictEqual([
      {
        toolCallId: 'toolu_1',
        toolCallType: 'function',
        toolName: 'json',
        args: '{"value":"example value"}',
      },
    ]);
    expect(finishReason).toStrictEqual('tool-calls');

    // check request to Anthropic
    const requestBodyJson = await server.getRequestBodyJson();
    expect(requestBodyJson).toStrictEqual({
      max_tokens: 4096,
      messages: [
        {
          content: [{ text: 'Hello', type: 'text' }],
          role: 'user',
        },
      ],
      model: 'claude-3-haiku-20240307',
      tool_choice: { name: 'json', type: 'tool' },
      tools: [
        {
          description: 'Respond with a JSON object.',
          input_schema: {
            $schema: 'http://json-schema.org/draft-07/schema#',
            additionalProperties: false,
            properties: { value: { type: 'string' } },
            required: ['value'],
            type: 'object',
          },
          name: 'json',
        },
      ],
    });
  });

  it('should extract usage', async () => {
    prepareJsonResponse({
      usage: { input_tokens: 20, output_tokens: 5 },
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
      model: 'test-model',
    });

    const { response } = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(response).toStrictEqual({
      id: 'test-id',
      modelId: 'test-model',
    });
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
      'content-length': '237',
      'content-type': 'application/json',

      // custom header
      'test-header': 'test-value',
    });
  });

  it('should send the model id and settings', async () => {
    prepareJsonResponse({});

    await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
      temperature: 0.5,
      maxTokens: 100,
      topP: 0.9,
      topK: 0.1,
      stopSequences: ['abc', 'def'],
      frequencyPenalty: 0.15,
    });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      model: 'claude-3-haiku-20240307',
      max_tokens: 100,
      stop_sequences: ['abc', 'def'],
      temperature: 0.5,
      top_k: 0.1,
      top_p: 0.9,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
    });
  });

  it('should pass tools and toolChoice', async () => {
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
      model: 'claude-3-haiku-20240307',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
      max_tokens: 4096,
      tools: [
        {
          name: 'test-tool',
          input_schema: {
            type: 'object',
            properties: { value: { type: 'string' } },
            required: ['value'],
            additionalProperties: false,
            $schema: 'http://json-schema.org/draft-07/schema#',
          },
        },
      ],
      tool_choice: {
        type: 'tool',
        name: 'test-tool',
      },
    });
  });

  it('should pass headers', async () => {
    prepareJsonResponse({ content: [] });

    const provider = createAnthropic({
      apiKey: 'test-api-key',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await provider('claude-3-haiku-20240307').doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
      headers: {
        'Custom-Request-Header': 'request-header-value',
      },
    });

    const requestHeaders = await server.getRequestHeaders();

    expect(requestHeaders).toStrictEqual({
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'custom-provider-header': 'provider-header-value',
      'custom-request-header': 'request-header-value',
      'x-api-key': 'test-api-key',
    });
  });

  it('should support cache control', async () => {
    prepareJsonResponse({
      usage: {
        input_tokens: 20,
        output_tokens: 50,
        cache_creation_input_tokens: 10,
        cache_read_input_tokens: 5,
      },
    });

    const model = provider('claude-3-haiku-20240307', {
      cacheControl: true,
    });

    const result = await model.doGenerate({
      mode: { type: 'regular' },
      inputFormat: 'messages',
      prompt: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }],
          providerMetadata: {
            anthropic: {
              cacheControl: { type: 'ephemeral' },
            },
          },
        },
      ],
    });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      model: 'claude-3-haiku-20240307',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Hello',
              cache_control: { type: 'ephemeral' },
            },
          ],
        },
      ],
      max_tokens: 4096,
    });

    expect(result.providerMetadata).toStrictEqual({
      anthropic: {
        cacheCreationInputTokens: 10,
        cacheReadInputTokens: 5,
      },
    });
  });

  it('should send request body', async () => {
    prepareJsonResponse({ content: [] });

    const { request } = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(request).toStrictEqual({
      body: '{"model":"claude-3-haiku-20240307","max_tokens":4096,"messages":[{"role":"user","content":[{"type":"text","text":"Hello"}]}]}',
    });
  });
});

describe('doStream', () => {
  const server = new StreamingTestServer(
    'https://api.anthropic.com/v1/messages',
  );

  server.setupTestEnvironment();

  function prepareStreamResponse({ content }: { content: string[] }) {
    server.responseChunks = [
      `data: {"type":"message_start","message":{"id":"msg_01KfpJoAEabmH2iHRRFjQMAG","type":"message","role":"assistant","content":[],"model":"claude-3-haiku-20240307","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":17,"output_tokens":1}}      }\n\n`,
      `data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}          }\n\n`,
      `data: {"type": "ping"}\n\n`,
      ...content.map(text => {
        return `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"${text}"}              }\n\n`;
      }),
      `data: {"type":"content_block_stop","index":0             }\n\n`,
      `data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":227}          }\n\n`,
      `data: {"type":"message_stop"           }\n\n`,
    ];
  }

  it('should stream text deltas', async () => {
    prepareStreamResponse({ content: ['Hello', ', ', 'World!'] });

    const { stream } = await model.doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    // note: space moved to last chunk bc of trimming
    expect(await convertReadableStreamToArray(stream)).toStrictEqual([
      {
        type: 'response-metadata',
        id: 'msg_01KfpJoAEabmH2iHRRFjQMAG',
        modelId: 'claude-3-haiku-20240307',
      },
      { type: 'text-delta', textDelta: 'Hello' },
      { type: 'text-delta', textDelta: ', ' },
      { type: 'text-delta', textDelta: 'World!' },
      {
        type: 'finish',
        finishReason: 'stop',
        usage: { promptTokens: 17, completionTokens: 227 },
        providerMetadata: undefined,
      },
    ]);
  });

  it('should stream tool deltas', async () => {
    server.responseChunks = [
      `data: {"type":"message_start","message":{"id":"msg_01GouTqNCGXzrj5LQ5jEkw67","type":"message","role":"assistant","model":"claude-3-haiku-20240307","stop_sequence":null,"usage":{"input_tokens":441,"output_tokens":2},"content":[],"stop_reason":null}            }\n\n`,
      `data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}      }\n\n`,
      `data: {"type": "ping"}\n\n`,
      `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Okay"}    }\n\n`,
      `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"!"}   }\n\n`,
      `data: {"type":"content_block_stop","index":0    }\n\n`,
      `data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_01DBsB4vvYLnBDzZ5rBSxSLs","name":"test-tool","input":{}}      }\n\n`,
      `data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":""}           }\n\n`,
      `data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"value"}              }\n\n`,
      `data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"\\":"}      }\n\n`,
      `data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"\\"Spark"}          }\n\n`,
      `data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"le"}          }\n\n`,
      `data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":" Day\\"}"}               }\n\n`,
      `data: {"type":"content_block_stop","index":1              }\n\n`,
      `data: {"type":"message_delta","delta":{"stop_reason":"tool_use","stop_sequence":null},"usage":{"output_tokens":65}           }\n\n`,
      `data: {"type":"message_stop"           }\n\n`,
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
        id: 'msg_01GouTqNCGXzrj5LQ5jEkw67',
        modelId: 'claude-3-haiku-20240307',
      },
      {
        type: 'text-delta',
        textDelta: 'Okay',
      },
      {
        type: 'text-delta',
        textDelta: '!',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'toolu_01DBsB4vvYLnBDzZ5rBSxSLs',
        toolCallType: 'function',
        toolName: 'test-tool',
        argsTextDelta: '',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'toolu_01DBsB4vvYLnBDzZ5rBSxSLs',
        toolCallType: 'function',
        toolName: 'test-tool',
        argsTextDelta: '{"value',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'toolu_01DBsB4vvYLnBDzZ5rBSxSLs',
        toolCallType: 'function',
        toolName: 'test-tool',
        argsTextDelta: '":',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'toolu_01DBsB4vvYLnBDzZ5rBSxSLs',
        toolCallType: 'function',
        toolName: 'test-tool',
        argsTextDelta: '"Spark',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'toolu_01DBsB4vvYLnBDzZ5rBSxSLs',
        toolCallType: 'function',
        toolName: 'test-tool',
        argsTextDelta: 'le',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'toolu_01DBsB4vvYLnBDzZ5rBSxSLs',
        toolCallType: 'function',
        toolName: 'test-tool',
        argsTextDelta: ' Day"}',
      },
      {
        type: 'tool-call',
        toolCallId: 'toolu_01DBsB4vvYLnBDzZ5rBSxSLs',
        toolCallType: 'function',
        toolName: 'test-tool',
        args: '{"value":"Sparkle Day"}',
      },
      {
        type: 'finish',
        finishReason: 'tool-calls',
        usage: { promptTokens: 441, completionTokens: 65 },
        providerMetadata: undefined,
      },
    ]);
  });

  it('should forward error chunks', async () => {
    server.responseChunks = [
      `data: {"type":"message_start","message":{"id":"msg_01KfpJoAEabmH2iHRRFjQMAG","type":"message","role":"assistant","content":[],"model":"claude-3-haiku-20240307","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":17,"output_tokens":1}}      }\n\n`,
      `data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}          }\n\n`,
      `data: {"type": "ping"}\n\n`,
      `data: {"type":"error","error":{"type":"error","message":"test error"}}\n\n`,
    ];

    const { stream } = await model.doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await convertReadableStreamToArray(stream)).toStrictEqual([
      {
        type: 'response-metadata',
        id: 'msg_01KfpJoAEabmH2iHRRFjQMAG',
        modelId: 'claude-3-haiku-20240307',
      },
      { type: 'error', error: { type: 'error', message: 'test error' } },
    ]);
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
      model: 'claude-3-haiku-20240307',
      max_tokens: 4096, // default value
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
    });
  });

  it('should pass headers', async () => {
    prepareStreamResponse({ content: [] });

    const provider = createAnthropic({
      apiKey: 'test-api-key',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await provider('claude-3-haiku-20240307').doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
      headers: {
        'Custom-Request-Header': 'request-header-value',
      },
    });

    const requestHeaders = await server.getRequestHeaders();

    expect(requestHeaders).toStrictEqual({
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'custom-provider-header': 'provider-header-value',
      'custom-request-header': 'request-header-value',
      'x-api-key': 'test-api-key',
    });
  });

  it('should support cache control', async () => {
    server.responseChunks = [
      `data: {"type":"message_start","message":{"id":"msg_01KfpJoAEabmH2iHRRFjQMAG","type":"message","role":"assistant","content":[],` +
        `"model":"claude-3-haiku-20240307","stop_reason":null,"stop_sequence":null,"usage":` +
        // send cache output tokens:
        `{"input_tokens":17,"output_tokens":1,"cache_creation_input_tokens":10,"cache_read_input_tokens":5}}      }\n\n`,
      `data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}          }\n\n`,
      `data: {"type": "ping"}\n\n`,
      `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"${'Hello'}"}              }\n\n`,
      `data: {"type":"content_block_stop","index":0             }\n\n`,
      `data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":227}          }\n\n`,
      `data: {"type":"message_stop"           }\n\n`,
    ];

    const model = provider('claude-3-haiku-20240307', {
      cacheControl: true,
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
        id: 'msg_01KfpJoAEabmH2iHRRFjQMAG',
        modelId: 'claude-3-haiku-20240307',
      },
      { type: 'text-delta', textDelta: 'Hello' },
      {
        type: 'finish',
        finishReason: 'stop',
        usage: { promptTokens: 17, completionTokens: 227 },
        providerMetadata: {
          anthropic: {
            cacheCreationInputTokens: 10,
            cacheReadInputTokens: 5,
          },
        },
      },
    ]);
  });

  it('should send request body', async () => {
    prepareStreamResponse({ content: [] });

    const { request } = await model.doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(request).toStrictEqual({
      body: '{"model":"claude-3-haiku-20240307","max_tokens":4096,"messages":[{"role":"user","content":[{"type":"text","text":"Hello"}]}],"stream":true}',
    });
  });
});
