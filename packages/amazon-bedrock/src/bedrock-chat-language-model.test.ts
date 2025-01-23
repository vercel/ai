import { LanguageModelV1Prompt } from '@ai-sdk/provider';
import { mockClient } from 'aws-sdk-client-mock';
import { createAmazonBedrock } from './bedrock-provider';
import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseStreamCommand,
  ConverseStreamOutput,
  ConverseStreamTrace,
  StopReason,
} from '@aws-sdk/client-bedrock-runtime';
import {
  convertArrayToAsyncIterable,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';

const TEST_PROMPT: LanguageModelV1Prompt = [
  { role: 'system', content: 'System Prompt' },
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const bedrockMock = mockClient(BedrockRuntimeClient);

const provider = createAmazonBedrock({
  region: 'us-east-1',
  accessKeyId: 'test-access-key',
  secretAccessKey: 'test-secret-key',
  sessionToken: 'test-token-key',
});

const model = provider('anthropic.claude-3-haiku-20240307-v1:0');

const mockTrace = {
  guardrail: {
    inputAssessment: {
      '1abcd2ef34gh': {
        contentPolicy: {
          filters: [
            {
              action: 'BLOCKED' as const,
              confidence: 'LOW' as const,
              type: 'INSULTS' as const,
            },
          ],
        },
        wordPolicy: {
          managedWordLists: [
            {
              action: 'BLOCKED' as const,
              match: '<rude word>',
              type: 'PROFANITY' as const,
            },
          ],
          customWords: undefined,
        },
      },
    },
  },
} as ConverseStreamTrace;

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

  it('should pass tool specification in object-tool mode', async () => {
    bedrockMock.on(ConverseCommand).resolves({
      output: {
        message: { role: 'assistant', content: [{ text: 'ignored' }] },
      },
    });

    await provider('amazon.titan-tg1-large').doGenerate({
      inputFormat: 'prompt',
      mode: {
        type: 'object-tool',
        tool: {
          name: 'test-tool',
          type: 'function',
          parameters: {
            type: 'object',
            properties: {
              property1: { type: 'string' },
              property2: { type: 'number' },
            },
            required: ['property1', 'property2'],
            additionalProperties: false,
          },
        },
      },
      prompt: TEST_PROMPT,
    });

    expect(
      bedrockMock.commandCalls(ConverseCommand, {
        modelId: 'amazon.titan-tg1-large',
        messages: [{ role: 'user', content: [{ text: 'Hello' }] }],
        system: [{ text: 'System Prompt' }],
        toolConfig: {
          tools: [
            {
              toolSpec: {
                name: 'test-tool',
                description: undefined,
                inputSchema: {
                  json: {
                    type: 'object',
                    properties: {
                      property1: { type: 'string' },
                      property2: { type: 'number' },
                    },
                    required: ['property1', 'property2'],
                    additionalProperties: false,
                  },
                },
              },
            },
          ],
        },
      }).length,
    ).toBe(1);
  });

  it('should support guardrails', async () => {
    bedrockMock.on(ConverseCommand).resolves({
      output: {
        message: { role: 'assistant', content: [{ text: 'Testing' }] },
      },
    });

    // GuardrailConfiguration
    const result = await provider('amazon.titan-tg1-large').doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
      providerMetadata: {
        bedrock: {
          guardrailConfig: {
            guardrailIdentifier: '-1',
            guardrailVersion: '1',
            trace: 'enabled',
          },
        },
      },
    });

    expect(
      bedrockMock.commandCalls(ConverseCommand, {
        modelId: 'amazon.titan-tg1-large',
        messages: [{ role: 'user', content: [{ text: 'Hello' }] }],
        system: [{ text: 'System Prompt' }],
        guardrailConfig: {
          guardrailIdentifier: '-1',
          guardrailVersion: '1',
          trace: 'enabled',
        },
      }).length,
    ).toBe(1);
  });

  it('should include trace information in providerMetadata', async () => {
    bedrockMock.on(ConverseCommand).resolves({
      trace: mockTrace,
    });

    const response = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(response.providerMetadata?.bedrock.trace).toMatchObject(mockTrace);
  });

  it('should pass tools and tool choice correctly', async () => {
    bedrockMock.on(ConverseCommand).resolves({
      output: {
        message: { role: 'assistant', content: [{ text: 'Testing' }] },
      },
    });

    await provider('amazon.titan-tg1-large').doGenerate({
      inputFormat: 'prompt',
      mode: {
        type: 'regular',
        tools: [
          {
            type: 'function',
            name: 'test-tool-1',
            description: 'A test tool',
            parameters: {
              type: 'object',
              properties: {
                param1: { type: 'string' },
                param2: { type: 'number' },
              },
              required: ['param1'],
              additionalProperties: false,
            },
          },
          {
            type: 'provider-defined',
            name: 'unsupported-tool',
            id: 'provider.unsupported-tool',
            args: {},
          },
        ],
        toolChoice: { type: 'auto' },
      },
      prompt: TEST_PROMPT,
    });

    const calls = bedrockMock.commandCalls(ConverseCommand);
    expect(calls.length).toBe(1);
    expect(calls[0].args[0].input).toStrictEqual({
      additionalModelRequestFields: undefined,
      guardrailConfig: undefined,
      inferenceConfig: {
        maxTokens: undefined,
        stopSequences: undefined,
        temperature: undefined,
        topP: undefined,
      },
      modelId: 'amazon.titan-tg1-large',
      messages: [{ role: 'user', content: [{ text: 'Hello' }] }],
      system: [{ text: 'System Prompt' }],
      toolConfig: {
        tools: [
          {
            toolSpec: {
              name: 'test-tool-1',
              description: 'A test tool',
              inputSchema: {
                json: {
                  type: 'object',
                  properties: {
                    param1: { type: 'string' },
                    param2: { type: 'number' },
                  },
                  required: ['param1'],
                  additionalProperties: false,
                },
              },
            },
          },
        ],
        toolChoice: { auto: {} },
      },
    });
  });
});

describe('doStream', () => {
  beforeEach(() => {
    bedrockMock.reset();
  });

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
      stream: convertArrayToAsyncIterable(streamData),
    });

    const { stream } = await model.doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await convertReadableStreamToArray(stream)).toStrictEqual([
      { type: 'text-delta', textDelta: 'Hello' },
      { type: 'text-delta', textDelta: ', ' },
      { type: 'text-delta', textDelta: 'World!' },
      {
        type: 'finish',
        finishReason: 'stop',
        usage: { promptTokens: 4, completionTokens: 34 },
        providerMetadata: undefined,
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
          contentBlockIndex: 0,
          delta: { toolUse: { input: '{"value":' } },
        },
      },
      {
        contentBlockDelta: {
          contentBlockIndex: 0,
          delta: { toolUse: { input: '"Sparkle Day"}' } },
        },
      },
      { contentBlockStop: { contentBlockIndex: 0 } },
      { messageStop: { stopReason: 'tool_use' } },
    ];

    bedrockMock.on(ConverseStreamCommand).resolves({
      stream: convertArrayToAsyncIterable(streamData),
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

    expect(await convertReadableStreamToArray(stream)).toStrictEqual([
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
        providerMetadata: undefined,
      },
    ]);
  });

  it('should stream parallel tool calls', async () => {
    const streamData: ConverseStreamOutput[] = [
      {
        contentBlockStart: {
          contentBlockIndex: 0,
          start: {
            toolUse: { toolUseId: 'tool-use-id-1', name: 'test-tool-1' },
          },
        },
      },
      {
        contentBlockDelta: {
          contentBlockIndex: 0,
          delta: { toolUse: { input: '{"value1":' } },
        },
      },
      {
        contentBlockStart: {
          contentBlockIndex: 1,
          start: {
            toolUse: { toolUseId: 'tool-use-id-2', name: 'test-tool-2' },
          },
        },
      },
      {
        contentBlockDelta: {
          contentBlockIndex: 1,
          delta: { toolUse: { input: '{"value2":' } },
        },
      },
      {
        contentBlockDelta: {
          contentBlockIndex: 1,
          delta: { toolUse: { input: '"Sparkle Day"}' } },
        },
      },
      {
        contentBlockDelta: {
          contentBlockIndex: 0,
          delta: { toolUse: { input: '"Sparkle Day"}' } },
        },
      },
      { contentBlockStop: { contentBlockIndex: 0 } },
      { contentBlockStop: { contentBlockIndex: 1 } },
      { messageStop: { stopReason: 'tool_use' } },
    ];

    bedrockMock.on(ConverseStreamCommand).resolves({
      stream: convertArrayToAsyncIterable(streamData),
    });

    const { stream } = await model.doStream({
      inputFormat: 'prompt',
      mode: {
        type: 'regular',
        tools: [
          {
            type: 'function',
            name: 'test-tool-1',
            parameters: {
              type: 'object',
              properties: { value1: { type: 'string' } },
              required: ['value'],
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
          {
            type: 'function',
            name: 'test-tool-2',
            parameters: {
              type: 'object',
              properties: { value2: { type: 'string' } },
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

    expect(await convertReadableStreamToArray(stream)).toStrictEqual([
      {
        type: 'tool-call-delta',
        toolCallId: 'tool-use-id-1',
        toolCallType: 'function',
        toolName: 'test-tool-1',
        argsTextDelta: '{"value1":',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'tool-use-id-2',
        toolCallType: 'function',
        toolName: 'test-tool-2',
        argsTextDelta: '{"value2":',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'tool-use-id-2',
        toolCallType: 'function',
        toolName: 'test-tool-2',
        argsTextDelta: '"Sparkle Day"}',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'tool-use-id-1',
        toolCallType: 'function',
        toolName: 'test-tool-1',
        argsTextDelta: '"Sparkle Day"}',
      },
      {
        type: 'tool-call',
        toolCallId: 'tool-use-id-1',
        toolCallType: 'function',
        toolName: 'test-tool-1',
        args: '{"value1":"Sparkle Day"}',
      },
      {
        type: 'tool-call',
        toolCallId: 'tool-use-id-2',
        toolCallType: 'function',
        toolName: 'test-tool-2',
        args: '{"value2":"Sparkle Day"}',
      },
      {
        type: 'finish',
        finishReason: 'tool-calls',
        usage: { promptTokens: NaN, completionTokens: NaN },
        providerMetadata: undefined,
      },
    ]);
  });

  it('should handle error stream parts', async () => {
    bedrockMock.on(ConverseStreamCommand).resolves({
      stream: convertArrayToAsyncIterable([
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

    expect(await convertReadableStreamToArray(stream)).toStrictEqual([
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
        providerMetadata: undefined,
      },
    ]);
  });

  it('should pass the messages and the model', async () => {
    bedrockMock.on(ConverseStreamCommand).resolves({
      stream: convertArrayToAsyncIterable([]),
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

  it('should support guardrails', async () => {
    bedrockMock.on(ConverseStreamCommand).resolves({
      stream: convertArrayToAsyncIterable([]),
    });

    await provider('amazon.titan-tg1-large').doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
      providerMetadata: {
        bedrock: {
          guardrailConfig: {
            guardrailIdentifier: '-1',
            guardrailVersion: '1',
            trace: 'enabled',
            streamProcessingMode: 'async',
          },
        },
      },
    });

    expect(
      bedrockMock.commandCalls(ConverseStreamCommand, {
        modelId: 'amazon.titan-tg1-large',
        messages: [{ role: 'user', content: [{ text: 'Hello' }] }],
        system: [{ text: 'System Prompt' }],
        guardrailConfig: {
          guardrailIdentifier: '-1',
          guardrailVersion: '1',
          trace: 'enabled',
          streamProcessingMode: 'async',
        },
      }).length,
    ).toBe(1);
  });

  it('should include trace information in providerMetadata', async () => {
    const streamData: ConverseStreamOutput[] = [
      { contentBlockDelta: { contentBlockIndex: 0, delta: { text: 'Hello' } } },
      {
        metadata: {
          usage: { inputTokens: 4, outputTokens: 34, totalTokens: 38 },
          metrics: { latencyMs: 10 },
          trace: mockTrace,
        },
      },
      { messageStop: { stopReason: 'stop_sequence' } },
    ];

    bedrockMock.on(ConverseStreamCommand).resolves({
      stream: convertArrayToAsyncIterable(streamData),
    });

    const { stream } = await model.doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await convertReadableStreamToArray(stream)).toStrictEqual([
      { type: 'text-delta', textDelta: 'Hello' },
      {
        type: 'finish',
        finishReason: 'stop',
        usage: { completionTokens: 34, promptTokens: 4 },
        providerMetadata: { bedrock: { trace: mockTrace } },
      },
    ]);
  });
});
