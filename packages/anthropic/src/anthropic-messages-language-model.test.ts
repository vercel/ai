import { LanguageModelV1Prompt } from '@ai-sdk/provider';
import {
  JsonTestServer,
  StreamingTestServer,
  convertStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { Anthropic } from './anthropic-facade';
import { AnthropicAssistantMessage } from './anthropic-messages-prompt';

const TEST_PROMPT: LanguageModelV1Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const anthropic = new Anthropic({
  apiKey: 'test-api-key',
});

const model = anthropic.messages('claude-3-haiku-20240307');

describe('doGenerate', () => {
  const server = new JsonTestServer('https://api.anthropic.com/v1/messages');

  server.setupTestEnvironment();

  function prepareJsonResponse({
    content = [{ type: 'text', text: '' }],
    usage = {
      input_tokens: 4,
      output_tokens: 30,
    },
    stopReason = 'end_turn',
  }: {
    content?: AnthropicAssistantMessage['content'];
    usage?: {
      input_tokens: number;
      output_tokens: number;
    };
    stopReason?: string;
  }) {
    server.responseBodyJson = {
      id: 'msg_017TfcQ4AgGxKyBduUpqYPZn',
      type: 'message',
      role: 'assistant',
      content,
      model: 'claude-3-haiku-20240307',
      stop_reason: stopReason,
      stop_sequence: null,
      usage,
    };
  }

  it('should extract text response', async () => {
    prepareJsonResponse({ content: [{ type: 'text', text: 'Hello, World!' }] });

    const { text } = await anthropic.messages('gpt-3.5-turbo').doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(text).toStrictEqual('Hello, World!');
  });

  it('should extract tool calls', async () => {
    prepareJsonResponse({
      content: [
        { type: 'text', text: 'Some text\n\n' },
        {
          type: 'tool_use',
          id: 'toolu_1',
          name: 'test-tool',
          input: { value: 'example value' },
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
        { type: 'text', text: 'Some text\n\n' },
        {
          type: 'tool_use',
          id: 'toolu_1',
          name: 'json',
          input: { value: 'example value' },
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

    // check injection of tool use instruction:
    expect((await server.getRequestBodyJson()).messages).toStrictEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'text', text: `\n\nUse the 'json' tool.` },
        ],
      },
    ]);
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

  it('should pass the model and the messages', async () => {
    prepareJsonResponse({});

    await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      model: 'claude-3-haiku-20240307',
      max_tokens: 4096, // default value
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
    });
  });

  it('should pass the api key as Authorization header', async () => {
    prepareJsonResponse({});

    const anthropic = new Anthropic({
      apiKey: 'test-api-key',
    });

    await anthropic.messages('claude-3-haiku-20240307').doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect((await server.getRequestHeaders()).get('x-api-key')).toStrictEqual(
      'test-api-key',
    );
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
    expect(await convertStreamToArray(stream)).toStrictEqual([
      { type: 'text-delta', textDelta: 'Hello' },
      { type: 'text-delta', textDelta: ', ' },
      { type: 'text-delta', textDelta: 'World!' },
      {
        type: 'finish',
        finishReason: 'stop',
        usage: { promptTokens: 17, completionTokens: 227 },
      },
    ]);
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

  it('should pass the api key as Authorization header', async () => {
    prepareStreamResponse({ content: [] });

    const anthropic = new Anthropic({
      apiKey: 'test-api-key',
    });

    await anthropic.messages('claude-3-haiku-2024').doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect((await server.getRequestHeaders()).get('x-api-key')).toStrictEqual(
      'test-api-key',
    );
  });
});
