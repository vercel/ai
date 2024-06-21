import { LanguageModelV1Prompt } from '@ai-sdk/provider';
import { mockClient } from 'aws-sdk-client-mock';
import { createAmazonBedrock } from './bedrock-provider';
import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseStreamCommand,
  ConverseStreamOutput,
  StopReason,
} from '@aws-sdk/client-bedrock-runtime';
import { convertStreamToArray } from '@ai-sdk/provider-utils/test';

const TEST_PROMPT: LanguageModelV1Prompt = [
  { role: 'system', content: 'System Prompt' },
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const bedrockMock = mockClient(BedrockRuntimeClient);

const provider = createAmazonBedrock({
  region: 'us-east-1',
  credentials: {
    accessKeyId: 'test-access-key',
    secretAccessKey: 'test-secret-key',
  },
});

const model = provider('anthropic.claude-3-haiku-20240307-v1:0');

describe('doGenerate', () => {
  beforeEach(() => {
    bedrockMock.reset();
  });

  it('should extract text response', async () => {
    bedrockMock.on(ConverseCommand).resolves({
      output: {
        message: { role: 'assistant', content: [{ text: 'Hello, World!' }] },
      },
    });

    const { text } = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(text).toStrictEqual('Hello, World!');
  });

  it('should extract usage', async () => {
    bedrockMock.on(ConverseCommand).resolves({
      usage: { inputTokens: 4, outputTokens: 34, totalTokens: 38 },
    });

    const { usage } = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(usage).toStrictEqual({
      promptTokens: 4,
      completionTokens: 34,
    });
  });

  it('should extract finish reason', async () => {
    bedrockMock.on(ConverseCommand).resolves({
      stopReason: 'stop_sequence',
    });

    const response = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(response.finishReason).toStrictEqual('stop');
  });

  it('should support unknown finish reason', async () => {
    bedrockMock.on(ConverseCommand).resolves({
      stopReason: 'eos' as StopReason,
    });

    const response = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(response.finishReason).toStrictEqual('unknown');
  });

  it('should pass the model and the messages', async () => {
    bedrockMock.on(ConverseCommand).resolves({
      output: {
        message: { role: 'assistant', content: [{ text: 'Testing' }] },
      },
    });

    await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(
      bedrockMock.commandCalls(ConverseCommand, {
        modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
        messages: [{ role: 'user', content: [{ text: 'Hello' }] }],
      }).length,
    ).toBe(1);
  });

  it('should pass settings', async () => {
    bedrockMock.on(ConverseCommand).resolves({
      output: {
        message: { role: 'assistant', content: [{ text: 'Testing' }] },
      },
    });

    await provider('amazon.titan-tg1-large', {
      additionalModelRequestFields: { top_k: 10 },
    }).doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
      maxTokens: 100,
      temperature: 0.5,
      topP: 0.5,
    });

    expect(
      bedrockMock.commandCalls(ConverseCommand, {
        modelId: 'amazon.titan-tg1-large',
        messages: [{ role: 'user', content: [{ text: 'Hello' }] }],
        additionalModelRequestFields: { top_k: 10 },
        system: [{ text: 'System Prompt' }],
        inferenceConfig: {
          maxTokens: 100,
          temperature: 0.5,
          topP: 0.5,
        },
      }).length,
    ).toBe(1);
  });
});

describe('doStream', () => {
  beforeEach(() => {
    bedrockMock.reset();
  });

  const createAsyncGenerator = (chunks: ConverseStreamOutput[]) => {
    return {
      async *[Symbol.asyncIterator]() {
        for (const data of chunks) {
          yield data;
        }
      },
    };
  };

  it('should stream text deltas', async () => {
    const streamData: ConverseStreamOutput[] = [
      { contentBlockDelta: { contentBlockIndex: 0, delta: { text: 'Hello' } } },
      { contentBlockDelta: { contentBlockIndex: 1, delta: { text: ', ' } } },
      {
        contentBlockDelta: { contentBlockIndex: 2, delta: { text: 'World!' } },
      },
      {
        metadata: {
          usage: { inputTokens: 4, outputTokens: 34, totalTokens: 38 },
          metrics: { latencyMs: 10 },
        },
      },
      {
        messageStop: { stopReason: 'stop_sequence' },
      },
    ];

    bedrockMock.on(ConverseStreamCommand).resolves({
      stream: createAsyncGenerator(streamData),
    });

    const { stream } = await model.doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await convertStreamToArray(stream)).toStrictEqual([
      { type: 'text-delta', textDelta: 'Hello' },
      { type: 'text-delta', textDelta: ', ' },
      { type: 'text-delta', textDelta: 'World!' },
      {
        type: 'finish',
        finishReason: 'stop',
        usage: { promptTokens: 4, completionTokens: 34 },
      },
    ]);
  });

  it('should stream tool deltas', async () => {
    const streamData: ConverseStreamOutput[] = [
      {
        contentBlockStart: {
          contentBlockIndex: 0,
          start: { toolUse: { toolUseId: 'tool-use-id', name: 'test-tool' } },
        },
      },
      {
        contentBlockDelta: {
          contentBlockIndex: 1,
          delta: { toolUse: { input: '{"value":' } },
        },
      },
      {
        contentBlockDelta: {
          contentBlockIndex: 2,
          delta: { toolUse: { input: '"Sparkle Day"}' } },
        },
      },
      { contentBlockStop: { contentBlockIndex: 3 } },
      { messageStop: { stopReason: 'tool_use' } },
    ];

    bedrockMock.on(ConverseStreamCommand).resolves({
      stream: createAsyncGenerator(streamData),
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
        toolChoice: { type: 'tool', toolName: 'test-tool' },
      },
      prompt: TEST_PROMPT,
    });

    expect(await convertStreamToArray(stream)).toStrictEqual([
      {
        type: 'tool-call-delta',
        toolCallId: 'tool-use-id',
        toolCallType: 'function',
        toolName: 'test-tool',
        argsTextDelta: '{"value":',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'tool-use-id',
        toolCallType: 'function',
        toolName: 'test-tool',
        argsTextDelta: '"Sparkle Day"}',
      },
      {
        type: 'tool-call',
        toolCallId: 'tool-use-id',
        toolCallType: 'function',
        toolName: 'test-tool',
        args: '{"value":"Sparkle Day"}',
      },
      {
        type: 'finish',
        finishReason: 'tool-calls',
        usage: { promptTokens: NaN, completionTokens: NaN },
      },
    ]);
  });

  it('should handle error stream parts', async () => {
    bedrockMock.on(ConverseStreamCommand).resolves({
      stream: createAsyncGenerator([
        {
          internalServerException: {
            message: 'Internal Server Error',
            name: 'InternalServerException',
            $fault: 'server',
            $metadata: {},
          },
        },
      ]),
    });

    const { stream } = await model.doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await convertStreamToArray(stream)).toStrictEqual([
      {
        type: 'error',
        error: {
          message: 'Internal Server Error',
          name: 'InternalServerException',
          $fault: 'server',
          $metadata: {},
        },
      },
      {
        finishReason: 'error',
        type: 'finish',
        usage: {
          completionTokens: NaN,
          promptTokens: NaN,
        },
      },
    ]);
  });

  it('should pass the messages and the model', async () => {
    bedrockMock.on(ConverseStreamCommand).resolves({
      stream: createAsyncGenerator([]),
    });

    await model.doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(
      bedrockMock.commandCalls(ConverseStreamCommand, {
        modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
        messages: [{ role: 'user', content: [{ text: 'Hello' }] }],
      }).length,
    ).toBe(1);
  });
});
