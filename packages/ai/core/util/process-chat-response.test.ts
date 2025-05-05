import { LanguageModelV2FinishReason } from '@ai-sdk/provider';
import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { describe, expect, it, vi } from 'vitest';
import {
  DataStreamText,
  formatDataStreamPart,
} from '../../src/data-stream/data-stream-parts';
import { JSONValue, LanguageModelUsage, UIMessage } from '../types';
import { processChatResponse } from './process-chat-response';

function createDataProtocolStream(
  dataPartTexts: DataStreamText[],
): ReadableStream<Uint8Array> {
  return convertArrayToReadableStream(dataPartTexts).pipeThrough(
    new TextEncoderStream(),
  );
}

let updateCalls: Array<{
  message: UIMessage;
  data: JSONValue[] | undefined;
  replaceLastMessage: boolean;
}> = [];
const update = (options: {
  message: UIMessage;
  data: JSONValue[] | undefined;
  replaceLastMessage: boolean;
}) => {
  // clone to preserve the original object
  updateCalls.push(structuredClone(options));
};

let finishCalls: Array<{
  message: UIMessage | undefined;
  finishReason: LanguageModelV2FinishReason;
  usage: LanguageModelUsage;
}> = [];
const onFinish = (options: {
  message: UIMessage | undefined;
  finishReason: LanguageModelV2FinishReason;
  usage: LanguageModelUsage;
}) => {
  // clone to preserve the original object
  finishCalls.push({ ...options });
};

export function mockId(): () => string {
  let counter = 0;
  return () => `id-${counter++}`;
}

describe('processChatResponse', () => {
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
          usage: {
            inputTokens: 5,
            outputTokens: 10,
            totalTokens: 15,
            reasoningTokens: undefined,
            cachedInputTokens: undefined,
          },
          isContinued: false,
        }),
        formatDataStreamPart('finish_message', {
          finishReason: 'stop',
          usage: {
            inputTokens: 5,
            outputTokens: 10,
            totalTokens: 15,
            reasoningTokens: undefined,
            cachedInputTokens: undefined,
          },
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
          usage: {
            inputTokens: 5,
            outputTokens: 10,
            totalTokens: 15,
            reasoningTokens: undefined,
            cachedInputTokens: undefined,
          },
          isContinued: false,
        }),
        formatDataStreamPart('text', 'The weather in London is sunny.'),
        formatDataStreamPart('finish_step', {
          finishReason: 'stop',
          usage: {
            inputTokens: 2,
            outputTokens: 4,
            totalTokens: 6,
            reasoningTokens: undefined,
            cachedInputTokens: undefined,
          },
          isContinued: false,
        }),
        formatDataStreamPart('finish_message', {
          finishReason: 'stop',
          usage: {
            inputTokens: 7,
            outputTokens: 14,
            totalTokens: 21,
            reasoningTokens: undefined,
            cachedInputTokens: undefined,
          },
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
          usage: {
            inputTokens: 5,
            outputTokens: 10,
            totalTokens: 15,
            reasoningTokens: undefined,
            cachedInputTokens: undefined,
          },
          isContinued: false,
        }),
        formatDataStreamPart('text', 'The weather in London is sunny.'),
        formatDataStreamPart('finish_step', {
          finishReason: 'stop',
          usage: {
            inputTokens: 2,
            outputTokens: 4,
            totalTokens: 6,
            reasoningTokens: undefined,
            cachedInputTokens: undefined,
          },
          isContinued: false,
        }),
        formatDataStreamPart('finish_message', {
          finishReason: 'stop',
          usage: {
            inputTokens: 7,
            outputTokens: 14,
            totalTokens: 21,
            reasoningTokens: undefined,
            cachedInputTokens: undefined,
          },
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
        formatDataStreamPart(
          'text',
          'use a tool to get the weather in London.',
        ),
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
          usage: {
            inputTokens: 5,
            outputTokens: 10,
            totalTokens: 15,
            reasoningTokens: undefined,
            cachedInputTokens: undefined,
          },
          isContinued: false,
        }),
        formatDataStreamPart('text', 'The weather in London '),
        formatDataStreamPart('text', 'is sunny.'),
        formatDataStreamPart('finish_step', {
          finishReason: 'stop',
          usage: {
            inputTokens: 2,
            outputTokens: 4,
            totalTokens: 6,
            reasoningTokens: undefined,
            cachedInputTokens: undefined,
          },
          isContinued: false,
        }),
        formatDataStreamPart('finish_message', {
          finishReason: 'stop',
          usage: {
            inputTokens: 7,
            outputTokens: 14,
            totalTokens: 21,
            reasoningTokens: undefined,
            cachedInputTokens: undefined,
          },
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
        formatDataStreamPart('reasoning', {
          text: 'I will ',
        }),
        formatDataStreamPart('reasoning', {
          text: 'use a tool to get the weather in London.',
          providerMetadata: {
            testProvider: { signature: '1234567890' },
          },
        }),
        formatDataStreamPart('reasoning_part_finish', {}),
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
          usage: {
            inputTokens: 5,
            outputTokens: 10,
            totalTokens: 15,
            reasoningTokens: undefined,
            cachedInputTokens: undefined,
          },
          isContinued: false,
        }),
        formatDataStreamPart('reasoning', {
          text: 'I know know the weather in London.',
          providerMetadata: {
            testProvider: { signature: 'abc123' },
          },
        }),
        formatDataStreamPart('reasoning_part_finish', {}),
        formatDataStreamPart('text', 'The weather in London is sunny.'),
        formatDataStreamPart('finish_step', {
          finishReason: 'stop',
          usage: {
            inputTokens: 2,
            outputTokens: 4,
            totalTokens: 6,
            reasoningTokens: undefined,
            cachedInputTokens: undefined,
          },
          isContinued: false,
        }),
        formatDataStreamPart('finish_message', {
          finishReason: 'stop',
          usage: {
            inputTokens: 7,
            outputTokens: 14,
            totalTokens: 21,
            reasoningTokens: undefined,
            cachedInputTokens: undefined,
          },
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
          usage: {
            inputTokens: 5,
            outputTokens: 10,
            totalTokens: 15,
            reasoningTokens: undefined,
            cachedInputTokens: undefined,
          },
          isContinued: true,
        }),
        formatDataStreamPart('text', 'is sunny.'),
        formatDataStreamPart('finish_step', {
          finishReason: 'stop',
          usage: {
            inputTokens: 2,
            outputTokens: 4,
            totalTokens: 6,
            reasoningTokens: undefined,
            cachedInputTokens: undefined,
          },
          isContinued: false,
        }),
        formatDataStreamPart('finish_message', {
          finishReason: 'stop',
          usage: {
            inputTokens: 7,
            outputTokens: 14,
            totalTokens: 21,
            reasoningTokens: undefined,
            cachedInputTokens: undefined,
          },
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
          usage: {
            inputTokens: 5,
            outputTokens: 10,
            totalTokens: 15,
            reasoningTokens: undefined,
            cachedInputTokens: undefined,
          },
          isContinued: false,
        }),
        formatDataStreamPart('finish_message', {
          finishReason: 'stop',
          usage: {
            inputTokens: 5,
            outputTokens: 10,
            totalTokens: 15,
            reasoningTokens: undefined,
            cachedInputTokens: undefined,
          },
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
          usage: {
            inputTokens: 5,
            outputTokens: 10,
            totalTokens: 15,
            reasoningTokens: undefined,
            cachedInputTokens: undefined,
          },
          isContinued: false,
        }),
        formatDataStreamPart('finish_message', {
          finishReason: 'stop',
          usage: {
            inputTokens: 5,
            outputTokens: 10,
            totalTokens: 15,
            reasoningTokens: undefined,
            cachedInputTokens: undefined,
          },
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
          usage: {
            inputTokens: 5,
            outputTokens: 10,
            totalTokens: 15,
            reasoningTokens: undefined,
            cachedInputTokens: undefined,
          },
          isContinued: false,
        }),
        formatDataStreamPart('finish_message', {
          finishReason: 'stop',
          usage: {
            inputTokens: 5,
            outputTokens: 10,
            totalTokens: 15,
            reasoningTokens: undefined,
            cachedInputTokens: undefined,
          },
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
          usage: {
            inputTokens: 5,
            outputTokens: 10,
            totalTokens: 15,
            reasoningTokens: undefined,
            cachedInputTokens: undefined,
          },
          isContinued: false,
        }),
        formatDataStreamPart('finish_message', {
          finishReason: 'stop',
          usage: {
            inputTokens: 5,
            outputTokens: 10,
            totalTokens: 15,
            reasoningTokens: undefined,
            cachedInputTokens: undefined,
          },
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
          usage: {
            inputTokens: 5,
            outputTokens: 10,
            totalTokens: 15,
            reasoningTokens: undefined,
            cachedInputTokens: undefined,
          },
          isContinued: false,
        }),
        formatDataStreamPart('finish_message', {
          finishReason: 'stop',
          usage: {
            inputTokens: 5,
            outputTokens: 10,
            totalTokens: 15,
            reasoningTokens: undefined,
            cachedInputTokens: undefined,
          },
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
        formatDataStreamPart('reasoning', {
          text: 'I will open the conversation',
        }),
        formatDataStreamPart('reasoning', {
          text: ' with witty banter. ',
          providerMetadata: {
            testProvider: { signature: '1234567890' },
          },
        }),
        formatDataStreamPart('reasoning', {
          text: 'redacted-data',
          providerMetadata: {
            testProvider: { isRedacted: true },
          },
        }),
        formatDataStreamPart('reasoning', {
          text: 'Once the user has relaxed,',
        }),
        formatDataStreamPart('reasoning', {
          text: ' I will pry for valuable information.',
          providerMetadata: {
            testProvider: { signature: 'abc123' },
          },
        }),
        formatDataStreamPart('reasoning_part_finish', {}),
        formatDataStreamPart('text', 'Hi there!'),
        formatDataStreamPart('finish_step', {
          finishReason: 'stop',
          usage: {
            inputTokens: 5,
            outputTokens: 10,
            totalTokens: 15,
            reasoningTokens: undefined,
            cachedInputTokens: undefined,
          },
          isContinued: false,
        }),
        formatDataStreamPart('finish_message', {
          finishReason: 'stop',
          usage: {
            inputTokens: 5,
            outputTokens: 10,
            totalTokens: 15,
            reasoningTokens: undefined,
            cachedInputTokens: undefined,
          },
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
          usage: {
            inputTokens: 5,
            outputTokens: 10,
            totalTokens: 15,
            reasoningTokens: undefined,
            cachedInputTokens: undefined,
          },
          isContinued: false,
        }),
        formatDataStreamPart('finish_message', {
          finishReason: 'stop',
          usage: {
            inputTokens: 5,
            outputTokens: 10,
            totalTokens: 15,
            reasoningTokens: undefined,
            cachedInputTokens: undefined,
          },
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
          type: 'source',
          sourceType: 'url',
          id: 'source-id',
          url: 'https://example.com',
          title: 'Example',
        }),
        formatDataStreamPart('finish_step', {
          finishReason: 'stop',
          usage: {
            inputTokens: 2,
            outputTokens: 4,
            totalTokens: 6,
            reasoningTokens: undefined,
            cachedInputTokens: undefined,
          },
          isContinued: false,
        }),
        formatDataStreamPart('finish_message', {
          finishReason: 'stop',
          usage: {
            inputTokens: 7,
            outputTokens: 14,
            totalTokens: 21,
            reasoningTokens: undefined,
            cachedInputTokens: undefined,
          },
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
          url: 'data:text/plain;base64,SGVsbG8gV29ybGQ=',
          mediaType: 'text/plain',
        }),
        formatDataStreamPart('text', 'And another one:'),
        formatDataStreamPart('file', {
          url: 'data:application/json;base64,eyJrZXkiOiJ2YWx1ZSJ9',
          mediaType: 'application/json',
        }),
        formatDataStreamPart('finish_step', {
          finishReason: 'stop',
          usage: {
            inputTokens: 2,
            outputTokens: 4,
            totalTokens: 6,
            reasoningTokens: undefined,
            cachedInputTokens: undefined,
          },
          isContinued: false,
        }),
        formatDataStreamPart('finish_message', {
          finishReason: 'stop',
          usage: {
            inputTokens: 5,
            outputTokens: 10,
            totalTokens: 15,
            reasoningTokens: undefined,
            cachedInputTokens: undefined,
          },
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
});
