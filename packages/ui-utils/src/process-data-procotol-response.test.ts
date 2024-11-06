import { describe, expect, it, vi } from 'vitest';
import { processDataProtocolResponse } from './process-data-protocol-response';
import { formatStreamPart } from './stream-parts';
import { createDataProtocolStream } from './test/create-data-protocol-stream';
import { JSONValue, Message } from './types';
import { LanguageModelV1FinishReason } from '@ai-sdk/provider';

let updateCalls: Array<{
  newMessages: Message[];
  data: JSONValue[] | undefined;
}> = [];
const update = (newMessages: Message[], data: JSONValue[] | undefined) => {
  // clone to preserve the original object
  updateCalls.push(JSON.parse(JSON.stringify({ newMessages, data })));
};

let finishCalls: Array<{
  message: Message | undefined;
  finishReason: LanguageModelV1FinishReason;
  usage: {
    completionTokens: number;
    promptTokens: number;
    totalTokens: number;
  };
}> = [];
const onFinish = (options: {
  message: Message | undefined;
  finishReason: LanguageModelV1FinishReason;
  usage: {
    completionTokens: number;
    promptTokens: number;
    totalTokens: number;
  };
}) => {
  // clone to preserve the original object
  finishCalls.push(JSON.parse(JSON.stringify(options)));
};

beforeEach(() => {
  updateCalls = [];
  finishCalls = [];
});

describe('scenario: simple text response', () => {
  let result: Awaited<ReturnType<typeof processDataProtocolResponse>>;

  beforeEach(async () => {
    const stream = createDataProtocolStream([
      formatStreamPart('text', 'Hello, '),
      formatStreamPart('text', 'world!'),
      formatStreamPart('finish_step', {
        finishReason: 'stop',
        usage: { completionTokens: 5, promptTokens: 10 },
        isContinued: false,
      }),
      formatStreamPart('finish_message', {
        finishReason: 'stop',
        usage: { completionTokens: 5, promptTokens: 10 },
      }),
    ]);

    result = await processDataProtocolResponse({
      reader: stream.getReader(),
      update,
      onFinish,
      generateId: vi.fn().mockReturnValue('mock-id'),
      getCurrentDate: vi.fn().mockReturnValue(new Date('2023-01-01')),
    });
  });

  it('should return the correct messages', async () => {
    expect(result.messages).toStrictEqual([
      {
        id: 'mock-id',
        role: 'assistant',
        content: 'Hello, world!',
        createdAt: new Date('2023-01-01'),
      },
    ]);
  });

  it('should call the update function with the correct arguments', async () => {
    expect(updateCalls).toStrictEqual([
      {
        newMessages: [
          {
            content: 'Hello, ',
            createdAt: '2023-01-01T00:00:00.000Z',
            id: 'mock-id',
            role: 'assistant',
          },
        ],
        data: [],
      },
      {
        newMessages: [
          {
            content: 'Hello, world!',
            createdAt: '2023-01-01T00:00:00.000Z',
            id: 'mock-id',
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
          createdAt: '2023-01-01T00:00:00.000Z',
          id: 'mock-id',
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
  let result: Awaited<ReturnType<typeof processDataProtocolResponse>>;

  beforeEach(async () => {
    const stream = createDataProtocolStream([
      formatStreamPart('tool_call', {
        toolCallId: 'tool-call-id',
        toolName: 'tool-name',
        args: { city: 'London' },
      }),
      formatStreamPart('tool_result', {
        toolCallId: 'tool-call-id',
        result: { weather: 'sunny' },
      }),
      formatStreamPart('finish_step', {
        finishReason: 'tool-calls',
        usage: { completionTokens: 5, promptTokens: 10 },
        isContinued: false,
      }),
      formatStreamPart('text', 'The weather in London is sunny.'),
      formatStreamPart('finish_step', {
        finishReason: 'stop',
        usage: { completionTokens: 2, promptTokens: 4 },
        isContinued: false,
      }),
      formatStreamPart('finish_message', {
        finishReason: 'stop',
        usage: { completionTokens: 7, promptTokens: 14 },
      }),
    ]);

    result = await processDataProtocolResponse({
      reader: stream.getReader(),
      update,
      onFinish,
      generateId: vi.fn().mockReturnValue('mock-id'),
      getCurrentDate: vi.fn().mockReturnValue(new Date('2023-01-01')),
    });
  });

  it('should return the correct messages', async () => {
    expect(result.messages).toStrictEqual([
      {
        id: 'mock-id',
        role: 'assistant',
        content: 'The weather in London is sunny.',
        createdAt: new Date('2023-01-01'),
      },
    ]);
  });

  it('should call the update function with the correct arguments', async () => {
    expect(updateCalls).toStrictEqual([
      {
        newMessages: [
          {
            id: 'mock-id',
            role: 'assistant',
            content: '',
            createdAt: '2023-01-01T00:00:00.000Z',
            internalUpdateId: 'mock-id',
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
            id: 'mock-id',
            role: 'assistant',
            content: '',
            createdAt: '2023-01-01T00:00:00.000Z',
            internalUpdateId: 'mock-id',
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
            createdAt: '2023-01-01T00:00:00.000Z',
            id: 'mock-id',
            internalUpdateId: 'mock-id',
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
            id: 'mock-id',
            role: 'assistant',
            content: 'The weather in London is sunny.',
            createdAt: '2023-01-01T00:00:00.000Z',
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
          id: 'mock-id',
          role: 'assistant',
          content: 'The weather in London is sunny.',
          createdAt: '2023-01-01T00:00:00.000Z',
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
  let result: Awaited<ReturnType<typeof processDataProtocolResponse>>;

  beforeEach(async () => {
    const stream = createDataProtocolStream([
      formatStreamPart('text', 'The weather in London '),
      formatStreamPart('finish_step', {
        finishReason: 'length',
        usage: { completionTokens: 5, promptTokens: 10 },
        isContinued: true,
      }),
      formatStreamPart('text', 'is sunny.'),
      formatStreamPart('finish_step', {
        finishReason: 'stop',
        usage: { completionTokens: 2, promptTokens: 4 },
        isContinued: false,
      }),
      formatStreamPart('finish_message', {
        finishReason: 'stop',
        usage: { completionTokens: 7, promptTokens: 14 },
      }),
    ]);

    result = await processDataProtocolResponse({
      reader: stream.getReader(),
      update,
      onFinish,
      generateId: vi.fn().mockReturnValue('mock-id'),
      getCurrentDate: vi.fn().mockReturnValue(new Date('2023-01-01')),
    });
  });

  it('should return the correct messages', async () => {
    expect(result.messages).toStrictEqual([
      {
        id: 'mock-id',
        role: 'assistant',
        content: 'The weather in London is sunny.',
        createdAt: new Date('2023-01-01'),
      },
    ]);
  });

  it('should call the update function with the correct arguments', async () => {
    expect(updateCalls).toStrictEqual([
      {
        newMessages: [
          {
            id: 'mock-id',
            role: 'assistant',
            content: 'The weather in London ',
            createdAt: '2023-01-01T00:00:00.000Z',
          },
        ],
        data: [],
      },
      {
        newMessages: [
          {
            id: 'mock-id',
            role: 'assistant',
            content: 'The weather in London is sunny.',
            createdAt: '2023-01-01T00:00:00.000Z',
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
          id: 'mock-id',
          role: 'assistant',
          content: 'The weather in London is sunny.',
          createdAt: '2023-01-01T00:00:00.000Z',
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
  let result: Awaited<ReturnType<typeof processDataProtocolResponse>>;

  beforeEach(async () => {
    const stream = createDataProtocolStream([
      formatStreamPart('text', 'text'),
      formatStreamPart('finish_step', {
        finishReason: 'stop',
        usage: { completionTokens: 5, promptTokens: 10 },
        isContinued: false,
      }),
      formatStreamPart('finish_message', {
        finishReason: 'stop',
        usage: { completionTokens: 5, promptTokens: 10 },
      }),
      // delayed message annotations:
      formatStreamPart('message_annotations', [
        {
          example: 'annotation',
        },
      ]),
    ]);

    result = await processDataProtocolResponse({
      reader: stream.getReader(),
      update,
      onFinish,
      generateId: vi.fn().mockReturnValue('mock-id'),
      getCurrentDate: vi.fn().mockReturnValue(new Date('2023-01-01')),
    });
  });

  it('should return the correct messages', async () => {
    expect(result.messages).toStrictEqual([
      {
        id: 'mock-id',
        role: 'assistant',
        content: 'text',
        createdAt: new Date('2023-01-01'),
        annotations: [{ example: 'annotation' }],
        internalUpdateId: 'mock-id',
      },
    ]);
  });

  it('should call the update function with the correct arguments', async () => {
    expect(updateCalls).toStrictEqual([
      {
        newMessages: [
          {
            content: 'text',
            createdAt: '2023-01-01T00:00:00.000Z',
            id: 'mock-id',
            role: 'assistant',
          },
        ],
        data: [],
      },
      {
        newMessages: [
          {
            content: 'text',
            createdAt: '2023-01-01T00:00:00.000Z',
            id: 'mock-id',
            role: 'assistant',
            annotations: [{ example: 'annotation' }],
            internalUpdateId: 'mock-id',
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
          createdAt: '2023-01-01T00:00:00.000Z',
          id: 'mock-id',
          role: 'assistant',
          annotations: [{ example: 'annotation' }],
          internalUpdateId: 'mock-id',
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
  let result: Awaited<ReturnType<typeof processDataProtocolResponse>>;

  beforeEach(async () => {
    const stream = createDataProtocolStream([
      formatStreamPart('message_annotations', ['annotation1']),
      formatStreamPart('text', 't1'),
      formatStreamPart('message_annotations', ['annotation2']),
      formatStreamPart('text', 't2'),
      formatStreamPart('finish_step', {
        finishReason: 'stop',
        usage: { completionTokens: 5, promptTokens: 10 },
        isContinued: false,
      }),
      formatStreamPart('finish_message', {
        finishReason: 'stop',
        usage: { completionTokens: 5, promptTokens: 10 },
      }),
    ]);

    result = await processDataProtocolResponse({
      reader: stream.getReader(),
      update,
      onFinish,
      generateId: vi.fn().mockReturnValue('mock-id'),
      getCurrentDate: vi.fn().mockReturnValue(new Date('2023-01-01')),
    });
  });

  it('should return the correct messages', async () => {
    expect(result.messages).toStrictEqual([
      {
        id: 'mock-id',
        role: 'assistant',
        content: 't1t2',
        createdAt: new Date('2023-01-01'),
        annotations: ['annotation1', 'annotation2'],
        internalUpdateId: 'mock-id',
      },
    ]);
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
            createdAt: '2023-01-01T00:00:00.000Z',
            id: 'mock-id',
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
            createdAt: '2023-01-01T00:00:00.000Z',
            id: 'mock-id',
            role: 'assistant',
            annotations: ['annotation1', 'annotation2'],
            internalUpdateId: 'mock-id',
          },
        ],
        data: [],
      },
      {
        newMessages: [
          {
            content: 't1t2',
            createdAt: '2023-01-01T00:00:00.000Z',
            id: 'mock-id',
            role: 'assistant',
            annotations: ['annotation1', 'annotation2'],
            internalUpdateId: 'mock-id',
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
          createdAt: '2023-01-01T00:00:00.000Z',
          id: 'mock-id',
          role: 'assistant',
          annotations: ['annotation1', 'annotation2'],
          internalUpdateId: 'mock-id',
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
