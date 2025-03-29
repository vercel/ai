import { LanguageModelV1FinishReason } from '@ai-sdk/provider';
import { describe, expect, it, vi } from 'vitest';
import { formatDataStreamPart } from './data-stream-parts';
import { LanguageModelUsage } from './duplicated/usage';
import { processChatResponse } from './process-chat-response';
import { createDataProtocolStream } from './test/create-data-protocol-stream';
import { JSONValue, Message } from './types';

let updateCalls: Array<{
  message: Message;
  data: JSONValue[] | undefined;
  replaceLastMessage: boolean;
}> = [];
const update = (options: {
  message: Message;
  data: JSONValue[] | undefined;
  replaceLastMessage: boolean;
}) => {
  // clone to preserve the original object
  updateCalls.push(structuredClone(options));
};

let finishCalls: Array<{
  message: Message | undefined;
  finishReason: LanguageModelV1FinishReason;
  usage: LanguageModelUsage;
}> = [];
const onFinish = (options: {
  message: Message | undefined;
  finishReason: LanguageModelV1FinishReason;
  usage: LanguageModelUsage;
}) => {
  // clone to preserve the original object
  finishCalls.push({ ...options });
};

export function mockId(): () => string {
  let counter = 0;
  return () => `id-${counter++}`;
}

beforeEach(() => {
  updateCalls = [];
  finishCalls = [];
});

describe('scenario: simple text response', () => {
  beforeEach(async () => {
    const stream = createDataProtocolStream([
      formatDataStreamPart('text', 'Hello, '),
      formatDataStreamPart('text', 'world!'),
      formatDataStreamPart('finish_step', {
        finishReason: 'stop',
        usage: { completionTokens: 5, promptTokens: 10 },
        isContinued: false,
      }),
      formatDataStreamPart('finish_message', {
        finishReason: 'stop',
        usage: { completionTokens: 5, promptTokens: 10 },
      }),
    ]);

    await processChatResponse({
      stream,
      update,
      onFinish,
      generateId: mockId(),
      getCurrentDate: vi.fn().mockReturnValue(new Date('2023-01-01')),
      lastMessage: undefined,
    });
  });

  it('should call the update function with the correct arguments', async () => {
    expect(updateCalls).toMatchSnapshot();
  });

  it('should call the onFinish function with the correct arguments', async () => {
    expect(finishCalls).toMatchSnapshot();
  });
});

describe('scenario: server-side tool roundtrip', () => {
  beforeEach(async () => {
    const stream = createDataProtocolStream([
      formatDataStreamPart('tool_call', {
        toolCallId: 'tool-call-id',
        toolName: 'tool-name',
        args: { city: 'London' },
      }),
      formatDataStreamPart('tool_result', {
        toolCallId: 'tool-call-id',
        result: { weather: 'sunny' },
      }),
      formatDataStreamPart('finish_step', {
        finishReason: 'tool-calls',
        usage: { completionTokens: 5, promptTokens: 10 },
        isContinued: false,
      }),
      formatDataStreamPart('text', 'The weather in London is sunny.'),
      formatDataStreamPart('finish_step', {
        finishReason: 'stop',
        usage: { completionTokens: 2, promptTokens: 4 },
        isContinued: false,
      }),
      formatDataStreamPart('finish_message', {
        finishReason: 'stop',
        usage: { completionTokens: 7, promptTokens: 14 },
      }),
    ]);

    await processChatResponse({
      stream,
      update,
      onFinish,
      generateId: mockId(),
      getCurrentDate: vi.fn().mockReturnValue(new Date('2023-01-01')),
      lastMessage: undefined,
    });
  });

  it('should call the update function with the correct arguments', async () => {
    expect(updateCalls).toMatchSnapshot();
  });

  it('should call the onFinish function with the correct arguments', async () => {
    expect(finishCalls).toMatchSnapshot();
  });
});

describe('scenario: server-side tool roundtrip with existing assistant message', () => {
  beforeEach(async () => {
    const stream = createDataProtocolStream([
      formatDataStreamPart('start_step', { messageId: 'step_123' }),
      formatDataStreamPart('tool_call', {
        toolCallId: 'tool-call-id',
        toolName: 'tool-name',
        args: { city: 'London' },
      }),
      formatDataStreamPart('tool_result', {
        toolCallId: 'tool-call-id',
        result: { weather: 'sunny' },
      }),
      formatDataStreamPart('finish_step', {
        finishReason: 'tool-calls',
        usage: { completionTokens: 5, promptTokens: 10 },
        isContinued: false,
      }),
      formatDataStreamPart('text', 'The weather in London is sunny.'),
      formatDataStreamPart('finish_step', {
        finishReason: 'stop',
        usage: { completionTokens: 2, promptTokens: 4 },
        isContinued: false,
      }),
      formatDataStreamPart('finish_message', {
        finishReason: 'stop',
        usage: { completionTokens: 7, promptTokens: 14 },
      }),
    ]);

    await processChatResponse({
      stream,
      update,
      onFinish,
      generateId: mockId(),
      getCurrentDate: vi.fn().mockReturnValue(new Date('2023-01-01')),
      lastMessage: {
        role: 'assistant',
        id: 'original-id',
        createdAt: new Date('2023-01-02T00:00:00.000Z'),
        content: '',
        toolInvocations: [
          {
            args: {},
            result: { location: 'Berlin' },
            state: 'result',
            step: 0,
            toolCallId: 'tool-call-id-original',
            toolName: 'tool-name-original',
          },
        ],
        parts: [
          {
            type: 'tool-invocation',
            toolInvocation: {
              args: {},
              result: { location: 'Berlin' },
              state: 'result',
              step: 0,
              toolCallId: 'tool-call-id-original',
              toolName: 'tool-name-original',
            },
          },
        ],
      },
    });
  });

  it('should call the update function with the correct arguments', async () => {
    expect(updateCalls).toMatchSnapshot();
  });

  it('should call the onFinish function with the correct arguments', async () => {
    expect(finishCalls).toMatchSnapshot();
  });
});

describe('scenario: server-side tool roundtrip with multiple assistant texts', () => {
  beforeEach(async () => {
    const stream = createDataProtocolStream([
      formatDataStreamPart('text', 'I will '),
      formatDataStreamPart('text', 'use a tool to get the weather in London.'),
      formatDataStreamPart('tool_call', {
        toolCallId: 'tool-call-id',
        toolName: 'tool-name',
        args: { city: 'London' },
      }),
      formatDataStreamPart('tool_result', {
        toolCallId: 'tool-call-id',
        result: { weather: 'sunny' },
      }),
      formatDataStreamPart('finish_step', {
        finishReason: 'tool-calls',
        usage: { completionTokens: 5, promptTokens: 10 },
        isContinued: false,
      }),
      formatDataStreamPart('text', 'The weather in London '),
      formatDataStreamPart('text', 'is sunny.'),
      formatDataStreamPart('finish_step', {
        finishReason: 'stop',
        usage: { completionTokens: 2, promptTokens: 4 },
        isContinued: false,
      }),
      formatDataStreamPart('finish_message', {
        finishReason: 'stop',
        usage: { completionTokens: 7, promptTokens: 14 },
      }),
    ]);

    await processChatResponse({
      stream,
      update,
      onFinish,
      generateId: mockId(),
      getCurrentDate: vi.fn().mockReturnValue(new Date('2023-01-01')),
      lastMessage: undefined,
    });
  });

  it('should call the update function with the correct arguments', async () => {
    expect(updateCalls).toMatchSnapshot();
  });

  it('should call the onFinish function with the correct arguments', async () => {
    expect(finishCalls).toMatchSnapshot();
  });
});

describe('scenario: server-side tool roundtrip with multiple assistant reasoning', () => {
  beforeEach(async () => {
    const stream = createDataProtocolStream([
      formatDataStreamPart('reasoning', 'I will '),
      formatDataStreamPart(
        'reasoning',
        'use a tool to get the weather in London.',
      ),
      formatDataStreamPart('reasoning_signature', {
        signature: '1234567890',
      }),
      formatDataStreamPart('tool_call', {
        toolCallId: 'tool-call-id',
        toolName: 'tool-name',
        args: { city: 'London' },
      }),
      formatDataStreamPart('tool_result', {
        toolCallId: 'tool-call-id',
        result: { weather: 'sunny' },
      }),
      formatDataStreamPart('finish_step', {
        finishReason: 'tool-calls',
        usage: { completionTokens: 5, promptTokens: 10 },
        isContinued: false,
      }),
      formatDataStreamPart('reasoning', 'I know know the weather in London.'),
      formatDataStreamPart('reasoning_signature', {
        signature: 'abc123',
      }),
      formatDataStreamPart('text', 'The weather in London is sunny.'),
      formatDataStreamPart('finish_step', {
        finishReason: 'stop',
        usage: { completionTokens: 2, promptTokens: 4 },
        isContinued: false,
      }),
      formatDataStreamPart('finish_message', {
        finishReason: 'stop',
        usage: { completionTokens: 7, promptTokens: 14 },
      }),
    ]);

    await processChatResponse({
      stream,
      update,
      onFinish,
      generateId: mockId(),
      getCurrentDate: vi.fn().mockReturnValue(new Date('2023-01-01')),
      lastMessage: undefined,
    });
  });

  it('should call the update function with the correct arguments', async () => {
    expect(updateCalls).toMatchSnapshot();
  });

  it('should call the onFinish function with the correct arguments', async () => {
    expect(finishCalls).toMatchSnapshot();
  });
});

describe('scenario: server-side continue roundtrip', () => {
  beforeEach(async () => {
    const stream = createDataProtocolStream([
      formatDataStreamPart('text', 'The weather in London '),
      formatDataStreamPart('finish_step', {
        finishReason: 'length',
        usage: { completionTokens: 5, promptTokens: 10 },
        isContinued: true,
      }),
      formatDataStreamPart('text', 'is sunny.'),
      formatDataStreamPart('finish_step', {
        finishReason: 'stop',
        usage: { completionTokens: 2, promptTokens: 4 },
        isContinued: false,
      }),
      formatDataStreamPart('finish_message', {
        finishReason: 'stop',
        usage: { completionTokens: 7, promptTokens: 14 },
      }),
    ]);

    await processChatResponse({
      stream,
      update,
      onFinish,
      generateId: mockId(),
      getCurrentDate: vi.fn().mockReturnValue(new Date('2023-01-01')),
      lastMessage: undefined,
    });
  });

  it('should call the update function with the correct arguments', async () => {
    expect(updateCalls).toMatchSnapshot();
  });

  it('should call the onFinish function with the correct arguments', async () => {
    expect(finishCalls).toMatchSnapshot();
  });
});

describe('scenario: delayed message annotations in onFinish', () => {
  beforeEach(async () => {
    const stream = createDataProtocolStream([
      formatDataStreamPart('text', 'text'),
      formatDataStreamPart('finish_step', {
        finishReason: 'stop',
        usage: { completionTokens: 5, promptTokens: 10 },
        isContinued: false,
      }),
      formatDataStreamPart('finish_message', {
        finishReason: 'stop',
        usage: { completionTokens: 5, promptTokens: 10 },
      }),
      // delayed message annotations:
      formatDataStreamPart('message_annotations', [
        {
          example: 'annotation',
        },
      ]),
    ]);

    await processChatResponse({
      stream,
      update,
      onFinish,
      generateId: mockId(),
      getCurrentDate: vi.fn().mockReturnValue(new Date('2023-01-01')),
      lastMessage: undefined,
    });
  });

  it('should call the update function with the correct arguments', async () => {
    expect(updateCalls).toMatchSnapshot();
  });

  it('should call the onFinish function with the correct arguments', async () => {
    expect(finishCalls).toMatchSnapshot();
  });
});

describe('scenario: message annotations in onChunk', () => {
  beforeEach(async () => {
    const stream = createDataProtocolStream([
      formatDataStreamPart('message_annotations', ['annotation1']),
      formatDataStreamPart('text', 't1'),
      formatDataStreamPart('message_annotations', ['annotation2']),
      formatDataStreamPart('text', 't2'),
      formatDataStreamPart('finish_step', {
        finishReason: 'stop',
        usage: { completionTokens: 5, promptTokens: 10 },
        isContinued: false,
      }),
      formatDataStreamPart('finish_message', {
        finishReason: 'stop',
        usage: { completionTokens: 5, promptTokens: 10 },
      }),
    ]);

    await processChatResponse({
      stream,
      update,
      onFinish,
      generateId: mockId(),
      getCurrentDate: vi.fn().mockReturnValue(new Date('2023-01-01')),
      lastMessage: undefined,
    });
  });

  it('should call the update function with the correct arguments', async () => {
    expect(updateCalls).toMatchSnapshot();
  });

  it('should call the onFinish function with the correct arguments', async () => {
    expect(finishCalls).toMatchSnapshot();
  });
});

describe('scenario: message annotations with existing assistant lastMessage', () => {
  beforeEach(async () => {
    const stream = createDataProtocolStream([
      formatDataStreamPart('message_annotations', ['annotation1']),
      formatDataStreamPart('text', 't1'),
      formatDataStreamPart('finish_step', {
        finishReason: 'stop',
        usage: { completionTokens: 5, promptTokens: 10 },
        isContinued: false,
      }),
      formatDataStreamPart('finish_message', {
        finishReason: 'stop',
        usage: { completionTokens: 5, promptTokens: 10 },
      }),
    ]);

    await processChatResponse({
      stream,
      update,
      onFinish,
      generateId: mockId(),
      getCurrentDate: vi.fn().mockReturnValue(new Date('2023-01-01')),
      lastMessage: {
        role: 'assistant',
        id: 'original-id',
        createdAt: new Date('2023-01-02T00:00:00.000Z'),
        content: '',
        annotations: ['annotation0'],
        parts: [],
      },
    });
  });

  it('should call the update function with the correct arguments', async () => {
    expect(updateCalls).toMatchSnapshot();
  });

  it('should call the onFinish function with the correct arguments', async () => {
    expect(finishCalls).toMatchSnapshot();
  });
});

describe('scenario: tool call streaming', () => {
  beforeEach(async () => {
    const stream = createDataProtocolStream([
      formatDataStreamPart('tool_call_streaming_start', {
        toolCallId: 'tool-call-0',
        toolName: 'test-tool',
      }),
      formatDataStreamPart('tool_call_delta', {
        toolCallId: 'tool-call-0',
        argsTextDelta: '{"testArg":"t',
      }),
      formatDataStreamPart('tool_call_delta', {
        toolCallId: 'tool-call-0',
        argsTextDelta: 'est-value"}}',
      }),
      formatDataStreamPart('tool_call', {
        toolCallId: 'tool-call-0',
        toolName: 'test-tool',
        args: { testArg: 'test-value' },
      }),
      formatDataStreamPart('tool_result', {
        toolCallId: 'tool-call-0',
        result: 'test-result',
      }),
      formatDataStreamPart('finish_step', {
        finishReason: 'stop',
        usage: { completionTokens: 5, promptTokens: 10 },
        isContinued: false,
      }),
      formatDataStreamPart('finish_message', {
        finishReason: 'stop',
        usage: { completionTokens: 5, promptTokens: 10 },
      }),
    ]);

    await processChatResponse({
      stream,
      update,
      onFinish,
      generateId: mockId(),
      getCurrentDate: vi.fn().mockReturnValue(new Date('2023-01-01')),
      lastMessage: undefined,
    });
  });

  it('should call the update function with the correct arguments', async () => {
    expect(updateCalls).toMatchSnapshot();
  });

  it('should call the onFinish function with the correct arguments', async () => {
    expect(finishCalls).toMatchSnapshot();
  });
});

describe('scenario: server provides message ids', () => {
  beforeEach(async () => {
    const stream = createDataProtocolStream([
      formatDataStreamPart('start_step', { messageId: 'step_123' }),
      formatDataStreamPart('text', 'Hello, '),
      formatDataStreamPart('text', 'world!'),
      formatDataStreamPart('finish_step', {
        finishReason: 'stop',
        usage: { completionTokens: 5, promptTokens: 10 },
        isContinued: false,
      }),
      formatDataStreamPart('finish_message', {
        finishReason: 'stop',
        usage: { completionTokens: 5, promptTokens: 10 },
      }),
    ]);

    await processChatResponse({
      stream,
      update,
      onFinish,
      generateId: mockId(),
      getCurrentDate: vi.fn().mockReturnValue(new Date('2023-01-01')),
      lastMessage: undefined,
    });
  });

  it('should call the update function with the correct arguments', async () => {
    expect(updateCalls).toMatchSnapshot();
  });

  it('should call the onFinish function with the correct arguments', async () => {
    expect(finishCalls).toMatchSnapshot();
  });
});

describe('scenario: server provides reasoning', () => {
  beforeEach(async () => {
    const stream = createDataProtocolStream([
      formatDataStreamPart('start_step', { messageId: 'step_123' }),
      formatDataStreamPart('reasoning', 'I will open the conversation'),
      formatDataStreamPart('reasoning', ' with witty banter. '),
      formatDataStreamPart('reasoning_signature', {
        signature: '1234567890',
      }),
      formatDataStreamPart('redacted_reasoning', {
        data: 'redacted-data',
      }),
      formatDataStreamPart('reasoning', 'Once the user has relaxed,'),
      formatDataStreamPart(
        'reasoning',
        ' I will pry for valuable information.',
      ),
      formatDataStreamPart('reasoning_signature', {
        signature: 'abc123',
      }),
      formatDataStreamPart('text', 'Hi there!'),
      formatDataStreamPart('finish_step', {
        finishReason: 'stop',
        usage: { completionTokens: 5, promptTokens: 10 },
        isContinued: false,
      }),
      formatDataStreamPart('finish_message', {
        finishReason: 'stop',
        usage: { completionTokens: 5, promptTokens: 10 },
      }),
    ]);

    await processChatResponse({
      stream,
      update,
      onFinish,
      generateId: mockId(),
      getCurrentDate: vi.fn().mockReturnValue(new Date('2023-01-01')),
      lastMessage: undefined,
    });
  });

  it('should call the update function with the correct arguments', async () => {
    expect(updateCalls).toMatchSnapshot();
  });

  it('should call the onFinish function with the correct arguments', async () => {
    expect(finishCalls).toMatchSnapshot();
  });
});

describe('scenario: onToolCall is executed', () => {
  beforeEach(async () => {
    const stream = createDataProtocolStream([
      formatDataStreamPart('tool_call', {
        toolCallId: 'tool-call-id',
        toolName: 'tool-name',
        args: { city: 'London' },
      }),
      formatDataStreamPart('finish_step', {
        finishReason: 'tool-calls',
        usage: { completionTokens: 5, promptTokens: 10 },
        isContinued: false,
      }),
      formatDataStreamPart('finish_message', {
        finishReason: 'stop',
        usage: { completionTokens: 5, promptTokens: 10 },
      }),
    ]);

    await processChatResponse({
      stream,
      update,
      onFinish,
      generateId: mockId(),
      getCurrentDate: vi.fn().mockReturnValue(new Date('2023-01-01')),
      lastMessage: undefined,
      onToolCall: vi.fn().mockResolvedValue('test-result'),
    });
  });

  it('should call the update function twice with the correct arguments', async () => {
    expect(updateCalls).toMatchSnapshot();
  });

  it('should call the onFinish function with the correct arguments', async () => {
    expect(finishCalls).toMatchSnapshot();
  });
});

describe('scenario: server provides sources', () => {
  beforeEach(async () => {
    const stream = createDataProtocolStream([
      formatDataStreamPart('text', 'The weather in London is sunny.'),
      formatDataStreamPart('source', {
        sourceType: 'url',
        id: 'source-id',
        url: 'https://example.com',
        title: 'Example',
      }),
      formatDataStreamPart('finish_step', {
        finishReason: 'stop',
        usage: { completionTokens: 2, promptTokens: 4 },
        isContinued: false,
      }),
      formatDataStreamPart('finish_message', {
        finishReason: 'stop',
        usage: { completionTokens: 7, promptTokens: 14 },
      }),
    ]);

    await processChatResponse({
      stream,
      update,
      onFinish,
      generateId: mockId(),
      getCurrentDate: vi.fn().mockReturnValue(new Date('2023-01-01')),
      lastMessage: undefined,
    });
  });

  it('should call the update function with the correct arguments', async () => {
    expect(updateCalls).toMatchSnapshot();
  });

  it('should call the onFinish function with the correct arguments', async () => {
    expect(finishCalls).toMatchSnapshot();
  });
});

describe('scenario: server provides file parts', () => {
  beforeEach(async () => {
    const stream = createDataProtocolStream([
      formatDataStreamPart('text', 'Here is a file:'),
      formatDataStreamPart('file', {
        data: 'Hello World',
        mimeType: 'text/plain',
      }),
      formatDataStreamPart('text', 'And another one:'),
      formatDataStreamPart('file', {
        data: '{"key": "value"}',
        mimeType: 'application/json',
      }),
      formatDataStreamPart('finish_step', {
        finishReason: 'stop',
        usage: { completionTokens: 2, promptTokens: 4 },
        isContinued: false,
      }),
      formatDataStreamPart('finish_message', {
        finishReason: 'stop',
        usage: { completionTokens: 7, promptTokens: 14 },
      }),
    ]);

    await processChatResponse({
      stream,
      update,
      onFinish,
      generateId: mockId(),
      getCurrentDate: vi.fn().mockReturnValue(new Date('2023-01-01')),
      lastMessage: undefined,
    });
  });

  it('should call the update function with the correct arguments', async () => {
    expect(updateCalls).toMatchSnapshot();
  });

  it('should call the onFinish function with the correct arguments', async () => {
    expect(finishCalls).toMatchSnapshot();
  });
});
