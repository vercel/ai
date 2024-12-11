import { LanguageModelV1FinishReason } from '@ai-sdk/provider';
import { describe, expect, it, vi } from 'vitest';
import { formatDataStreamPart } from './data-stream-parts';
import { processChatResponse } from './process-chat-response';
import { createDataProtocolStream } from './test/create-data-protocol-stream';
import { JSONValue, Message } from './types';
import { LanguageModelUsage } from './duplicated/usage';

let updateCalls: Array<{
  newMessages: Message[];
  data: JSONValue[] | undefined;
}> = [];
const update = (newMessages: Message[], data: JSONValue[] | undefined) => {
  // clone to preserve the original object
  updateCalls.push({ newMessages, data });
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
    });
  });

  it('should call the update function with the correct arguments', async () => {
    expect(updateCalls).toStrictEqual([
      {
        newMessages: [
          {
            content: 'Hello, ',
            createdAt: new Date('2023-01-01T00:00:00.000Z'),
            id: 'id-0',
            revisionId: 'id-1',
            role: 'assistant',
          },
        ],
        data: [],
      },
      {
        newMessages: [
          {
            content: 'Hello, world!',
            createdAt: new Date('2023-01-01T00:00:00.000Z'),
            id: 'id-0',
            revisionId: 'id-2',
            role: 'assistant',
          },
        ],
        data: [],
      },
    ]);
  });

  it('should call the onFinish function with the correct arguments', async () => {
    expect(finishCalls).toStrictEqual([
      {
        message: {
          content: 'Hello, world!',
          createdAt: new Date('2023-01-01T00:00:00.000Z'),
          id: 'id-0',
          role: 'assistant',
        },
        finishReason: 'stop',
        usage: {
          completionTokens: 5,
          promptTokens: 10,
          totalTokens: 15,
        },
      },
    ]);
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
    });
  });

  it('should call the update function with the correct arguments', async () => {
    expect(updateCalls).toStrictEqual([
      {
        newMessages: [
          {
            id: 'id-0',
            revisionId: 'id-1',
            role: 'assistant',
            content: '',
            createdAt: new Date('2023-01-01T00:00:00.000Z'),
            toolInvocations: [
              {
                args: {
                  city: 'London',
                },
                state: 'call',
                toolCallId: 'tool-call-id',
                toolName: 'tool-name',
              },
            ],
          },
        ],
        data: [],
      },
      {
        newMessages: [
          {
            id: 'id-0',
            revisionId: 'id-2',
            role: 'assistant',
            content: '',
            createdAt: new Date('2023-01-01T00:00:00.000Z'),
            toolInvocations: [
              {
                args: {
                  city: 'London',
                },
                result: {
                  weather: 'sunny',
                },
                state: 'result',
                toolCallId: 'tool-call-id',
                toolName: 'tool-name',
              },
            ],
          },
        ],
        data: [],
      },
      {
        newMessages: [
          {
            content: '',
            createdAt: new Date('2023-01-01T00:00:00.000Z'),
            id: 'id-0',
            role: 'assistant',
            toolInvocations: [
              {
                args: {
                  city: 'London',
                },
                result: {
                  weather: 'sunny',
                },
                state: 'result',
                toolCallId: 'tool-call-id',
                toolName: 'tool-name',
              },
            ],
          },
          {
            id: 'id-3',
            revisionId: 'id-4',
            role: 'assistant',
            content: 'The weather in London is sunny.',
            createdAt: new Date('2023-01-01T00:00:00.000Z'),
          },
        ],
        data: [],
      },
    ]);
  });

  it('should call the onFinish function with the correct arguments', async () => {
    expect(finishCalls).toStrictEqual([
      {
        message: {
          id: 'id-3',
          role: 'assistant',
          content: 'The weather in London is sunny.',
          createdAt: new Date('2023-01-01T00:00:00.000Z'),
        },
        finishReason: 'stop',
        usage: {
          completionTokens: 7,
          promptTokens: 14,
          totalTokens: 21,
        },
      },
    ]);
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
    });
  });

  it('should call the update function with the correct arguments', async () => {
    expect(updateCalls).toStrictEqual([
      {
        newMessages: [
          {
            id: 'id-0',
            revisionId: 'id-1',
            role: 'assistant',
            content: 'The weather in London ',
            createdAt: new Date('2023-01-01T00:00:00.000Z'),
          },
        ],
        data: [],
      },
      {
        newMessages: [
          {
            id: 'id-0',
            revisionId: 'id-2',
            role: 'assistant',
            content: 'The weather in London is sunny.',
            createdAt: new Date('2023-01-01T00:00:00.000Z'),
          },
        ],
        data: [],
      },
    ]);
  });

  it('should call the onFinish function with the correct arguments', async () => {
    expect(finishCalls).toStrictEqual([
      {
        message: {
          id: 'id-0',
          role: 'assistant',
          content: 'The weather in London is sunny.',
          createdAt: new Date('2023-01-01T00:00:00.000Z'),
        },
        finishReason: 'stop',
        usage: {
          completionTokens: 7,
          promptTokens: 14,
          totalTokens: 21,
        },
      },
    ]);
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
    });
  });

  it('should call the update function with the correct arguments', async () => {
    expect(updateCalls).toStrictEqual([
      {
        newMessages: [
          {
            content: 'text',
            createdAt: new Date('2023-01-01T00:00:00.000Z'),
            id: 'id-0',
            revisionId: 'id-1',
            role: 'assistant',
          },
        ],
        data: [],
      },
      {
        newMessages: [
          {
            content: 'text',
            createdAt: new Date('2023-01-01T00:00:00.000Z'),
            id: 'id-0',
            revisionId: 'id-2',
            role: 'assistant',
            annotations: [{ example: 'annotation' }],
          },
        ],
        data: [],
      },
    ]);
  });

  it('should call the onFinish function with the correct arguments', async () => {
    expect(finishCalls).toStrictEqual([
      {
        message: {
          content: 'text',
          createdAt: new Date('2023-01-01T00:00:00.000Z'),
          id: 'id-0',
          role: 'assistant',
          annotations: [{ example: 'annotation' }],
        },
        finishReason: 'stop',
        usage: {
          completionTokens: 5,
          promptTokens: 10,
          totalTokens: 15,
        },
      },
    ]);
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
    });
  });

  it('should call the update function with the correct arguments', async () => {
    expect(updateCalls).toStrictEqual([
      {
        newMessages: [],
        data: [],
      },
      {
        newMessages: [
          {
            content: 't1',
            createdAt: new Date('2023-01-01T00:00:00.000Z'),
            id: 'id-0',
            revisionId: 'id-1',
            role: 'assistant',
            annotations: ['annotation1'],
          },
        ],
        data: [],
      },
      {
        newMessages: [
          {
            content: 't1',
            createdAt: new Date('2023-01-01T00:00:00.000Z'),
            id: 'id-0',
            revisionId: 'id-2',
            role: 'assistant',
            annotations: ['annotation1', 'annotation2'],
          },
        ],
        data: [],
      },
      {
        newMessages: [
          {
            content: 't1t2',
            createdAt: new Date('2023-01-01T00:00:00.000Z'),
            id: 'id-0',
            revisionId: 'id-3',
            role: 'assistant',
            annotations: ['annotation1', 'annotation2'],
          },
        ],
        data: [],
      },
    ]);
  });

  it('should call the onFinish function with the correct arguments', async () => {
    expect(finishCalls).toStrictEqual([
      {
        message: {
          content: 't1t2',
          createdAt: new Date('2023-01-01T00:00:00.000Z'),
          id: 'id-0',
          role: 'assistant',
          annotations: ['annotation1', 'annotation2'],
        },
        finishReason: 'stop',
        usage: {
          completionTokens: 5,
          promptTokens: 10,
          totalTokens: 15,
        },
      },
    ]);
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
    });
  });

  it('should call the update function with the correct arguments', async () => {
    expect(updateCalls).toStrictEqual([
      {
        newMessages: [
          {
            content: '',
            createdAt: new Date('2023-01-01T00:00:00.000Z'),
            id: 'id-0',
            revisionId: 'id-1',
            role: 'assistant',
            toolInvocations: [
              {
                state: 'partial-call',
                toolCallId: 'tool-call-0',
                toolName: 'test-tool',
              },
            ],
          },
        ],
        data: [],
      },
      {
        newMessages: [
          {
            content: '',
            createdAt: new Date('2023-01-01T00:00:00.000Z'),
            id: 'id-0',
            revisionId: 'id-2',
            role: 'assistant',
            toolInvocations: [
              {
                args: {
                  testArg: 't',
                },
                state: 'partial-call',
                toolCallId: 'tool-call-0',
                toolName: 'test-tool',
              },
            ],
          },
        ],
        data: [],
      },
      {
        newMessages: [
          {
            content: '',
            createdAt: new Date('2023-01-01T00:00:00.000Z'),
            id: 'id-0',
            revisionId: 'id-3',
            role: 'assistant',
            toolInvocations: [
              {
                args: {
                  testArg: 'test-value',
                },
                state: 'partial-call',
                toolCallId: 'tool-call-0',
                toolName: 'test-tool',
              },
            ],
          },
        ],
        data: [],
      },
      {
        newMessages: [
          {
            content: '',
            createdAt: new Date('2023-01-01T00:00:00.000Z'),
            id: 'id-0',
            revisionId: 'id-4',
            role: 'assistant',
            toolInvocations: [
              {
                args: {
                  testArg: 'test-value',
                },
                state: 'call',
                toolCallId: 'tool-call-0',
                toolName: 'test-tool',
              },
            ],
          },
        ],
        data: [],
      },
      {
        newMessages: [
          {
            content: '',
            createdAt: new Date('2023-01-01T00:00:00.000Z'),
            id: 'id-0',
            revisionId: 'id-5',
            role: 'assistant',
            toolInvocations: [
              {
                args: {
                  testArg: 'test-value',
                },
                result: 'test-result',
                state: 'result',
                toolCallId: 'tool-call-0',
                toolName: 'test-tool',
              },
            ],
          },
        ],
        data: [],
      },
    ]);
  });

  it('should call the onFinish function with the correct arguments', async () => {
    expect(finishCalls).toStrictEqual([
      {
        message: {
          content: '',
          createdAt: new Date('2023-01-01T00:00:00.000Z'),
          id: 'id-0',
          role: 'assistant',
          toolInvocations: [
            {
              args: {
                testArg: 'test-value',
              },
              result: 'test-result',
              state: 'result',
              toolCallId: 'tool-call-0',
              toolName: 'test-tool',
            },
          ],
        },
        finishReason: 'stop',
        usage: {
          completionTokens: 5,
          promptTokens: 10,
          totalTokens: 15,
        },
      },
    ]);
  });
});
