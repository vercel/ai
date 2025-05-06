import { LanguageModelV2FinishReason } from '@ai-sdk/provider';
import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { DataStreamPart } from '../../src';
import { JsonToSseTransformStream } from '../../src/data-stream/json-to-sse-transform-stream';
import { JSONValue, LanguageModelUsage, UIMessage } from '../types';
import { processChatResponse } from './process-chat-response';

function createDataProtocolStream(
  parts: DataStreamPart[],
): ReadableStream<Uint8Array> {
  return convertArrayToReadableStream(parts)
    .pipeThrough(new JsonToSseTransformStream())
    .pipeThrough(new TextEncoderStream());
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
        { type: 'text', value: 'Hello, ' },
        { type: 'text', value: 'world!' },
        {
          type: 'finish-step',
          value: {
            finishReason: 'stop',
            usage: {
              inputTokens: 5,
              outputTokens: 10,
              totalTokens: 15,
              reasoningTokens: undefined,
              cachedInputTokens: undefined,
            },
            isContinued: false,
          },
        },
        {
          type: 'finish-message',
          value: {
            finishReason: 'stop',
            usage: {
              inputTokens: 5,
              outputTokens: 10,
              totalTokens: 15,
              reasoningTokens: undefined,
              cachedInputTokens: undefined,
            },
          },
        },
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
        {
          type: 'tool-call',
          value: {
            toolCallId: 'tool-call-id',
            toolName: 'tool-name',
            args: { city: 'London' },
          },
        },
        {
          type: 'tool-result',
          value: {
            toolCallId: 'tool-call-id',
            result: { weather: 'sunny' },
          },
        },
        {
          type: 'finish-step',
          value: {
            finishReason: 'tool-calls',
            usage: {
              inputTokens: 5,
              outputTokens: 10,
              totalTokens: 15,
              reasoningTokens: undefined,
              cachedInputTokens: undefined,
            },
            isContinued: false,
          },
        },
        { type: 'text', value: 'The weather in London is sunny.' },
        {
          type: 'finish-step',
          value: {
            finishReason: 'stop',
            usage: {
              inputTokens: 2,
              outputTokens: 4,
              totalTokens: 6,
              reasoningTokens: undefined,
              cachedInputTokens: undefined,
            },
            isContinued: false,
          },
        },
        {
          type: 'finish-message',
          value: {
            finishReason: 'stop',
            usage: {
              inputTokens: 7,
              outputTokens: 14,
              totalTokens: 21,
              reasoningTokens: undefined,
              cachedInputTokens: undefined,
            },
          },
        },
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
        { type: 'start-step', value: { messageId: 'step_123' } },
        {
          type: 'tool-call',
          value: {
            toolCallId: 'tool-call-id',
            toolName: 'tool-name',
            args: { city: 'London' },
          },
        },
        {
          type: 'tool-result',
          value: {
            toolCallId: 'tool-call-id',
            result: { weather: 'sunny' },
          },
        },
        {
          type: 'finish-step',
          value: {
            finishReason: 'tool-calls',
            usage: {
              inputTokens: 5,
              outputTokens: 10,
              totalTokens: 15,
              reasoningTokens: undefined,
              cachedInputTokens: undefined,
            },
            isContinued: false,
          },
        },
        { type: 'text', value: 'The weather in London is sunny.' },
        {
          type: 'finish-step',
          value: {
            finishReason: 'stop',
            usage: {
              inputTokens: 2,
              outputTokens: 4,
              totalTokens: 6,
              reasoningTokens: undefined,
              cachedInputTokens: undefined,
            },
            isContinued: false,
          },
        },
        {
          type: 'finish-message',
          value: {
            finishReason: 'stop',
            usage: {
              inputTokens: 7,
              outputTokens: 14,
              totalTokens: 21,
              reasoningTokens: undefined,
              cachedInputTokens: undefined,
            },
          },
        },
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
        { type: 'text', value: 'I will ' },
        { type: 'text', value: 'use a tool to get the weather in London.' },
        {
          type: 'tool-call',
          value: {
            toolCallId: 'tool-call-id',
            toolName: 'tool-name',
            args: { city: 'London' },
          },
        },
        {
          type: 'tool-result',
          value: {
            toolCallId: 'tool-call-id',
            result: { weather: 'sunny' },
          },
        },
        {
          type: 'finish-step',
          value: {
            finishReason: 'tool-calls',
            usage: {
              inputTokens: 5,
              outputTokens: 10,
              totalTokens: 15,
              reasoningTokens: undefined,
              cachedInputTokens: undefined,
            },
            isContinued: false,
          },
        },
        { type: 'text', value: 'The weather in London ' },
        { type: 'text', value: 'is sunny.' },
        {
          type: 'finish-step',
          value: {
            finishReason: 'stop',
            usage: {
              inputTokens: 2,
              outputTokens: 4,
              totalTokens: 6,
              reasoningTokens: undefined,
              cachedInputTokens: undefined,
            },
            isContinued: false,
          },
        },
        {
          type: 'finish-message',
          value: {
            finishReason: 'stop',
            usage: {
              inputTokens: 7,
              outputTokens: 14,
              totalTokens: 21,
              reasoningTokens: undefined,
              cachedInputTokens: undefined,
            },
          },
        },
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
        { type: 'reasoning', value: { text: 'I will ' } },
        {
          type: 'reasoning',
          value: {
            text: 'use a tool to get the weather in London.',
            providerMetadata: {
              testProvider: { signature: '1234567890' },
            },
          },
        },
        { type: 'reasoning-part-finish', value: null },
        {
          type: 'tool-call',
          value: {
            toolCallId: 'tool-call-id',
            toolName: 'tool-name',
            args: { city: 'London' },
          },
        },
        {
          type: 'tool-result',
          value: {
            toolCallId: 'tool-call-id',
            result: { weather: 'sunny' },
          },
        },
        {
          type: 'finish-step',
          value: {
            finishReason: 'tool-calls',
            usage: {
              inputTokens: 5,
              outputTokens: 10,
              totalTokens: 15,
              reasoningTokens: undefined,
              cachedInputTokens: undefined,
            },
            isContinued: false,
          },
        },
        {
          type: 'reasoning',
          value: {
            text: 'I know know the weather in London.',
            providerMetadata: {
              testProvider: { signature: 'abc123' },
            },
          },
        },
        { type: 'reasoning-part-finish', value: null },
        { type: 'text', value: 'The weather in London is sunny.' },
        {
          type: 'finish-step',
          value: {
            finishReason: 'stop',
            usage: {
              inputTokens: 2,
              outputTokens: 4,
              totalTokens: 6,
              reasoningTokens: undefined,
              cachedInputTokens: undefined,
            },
            isContinued: false,
          },
        },
        {
          type: 'finish-message',
          value: {
            finishReason: 'stop',
            usage: {
              inputTokens: 7,
              outputTokens: 14,
              totalTokens: 21,
              reasoningTokens: undefined,
              cachedInputTokens: undefined,
            },
          },
        },
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
        { type: 'text', value: 'The weather in London ' },
        {
          type: 'finish-step',
          value: {
            finishReason: 'length',
            usage: {
              inputTokens: 5,
              outputTokens: 10,
              totalTokens: 15,
              reasoningTokens: undefined,
              cachedInputTokens: undefined,
            },
            isContinued: true,
          },
        },
        { type: 'text', value: 'is sunny.' },
        {
          type: 'finish-step',
          value: {
            finishReason: 'stop',
            usage: {
              inputTokens: 2,
              outputTokens: 4,
              totalTokens: 6,
              reasoningTokens: undefined,
              cachedInputTokens: undefined,
            },
            isContinued: false,
          },
        },
        {
          type: 'finish-message',
          value: {
            finishReason: 'stop',
            usage: {
              inputTokens: 7,
              outputTokens: 14,
              totalTokens: 21,
              reasoningTokens: undefined,
              cachedInputTokens: undefined,
            },
          },
        },
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
        { type: 'text', value: 'text' },
        {
          type: 'finish-step',
          value: {
            finishReason: 'stop',
            usage: {
              inputTokens: 5,
              outputTokens: 10,
              totalTokens: 15,
              reasoningTokens: undefined,
              cachedInputTokens: undefined,
            },
            isContinued: false,
          },
        },
        {
          type: 'finish-message',
          value: {
            finishReason: 'stop',
            usage: {
              inputTokens: 5,
              outputTokens: 10,
              totalTokens: 15,
              reasoningTokens: undefined,
              cachedInputTokens: undefined,
            },
          },
        },
        // delayed message annotations:
        {
          type: 'message-annotations',
          value: [
            {
              example: 'annotation',
            },
          ],
        },
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
        {
          type: 'message-annotations',
          value: ['annotation1'],
        },
        { type: 'text', value: 't1' },
        {
          type: 'message-annotations',
          value: ['annotation2'],
        },
        { type: 'text', value: 't2' },
        {
          type: 'finish-step',
          value: {
            finishReason: 'stop',
            usage: {
              inputTokens: 5,
              outputTokens: 10,
              totalTokens: 15,
              reasoningTokens: undefined,
              cachedInputTokens: undefined,
            },
            isContinued: false,
          },
        },
        {
          type: 'finish-message',
          value: {
            finishReason: 'stop',
            usage: {
              inputTokens: 5,
              outputTokens: 10,
              totalTokens: 15,
              reasoningTokens: undefined,
              cachedInputTokens: undefined,
            },
          },
        },
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
        {
          type: 'message-annotations',
          value: ['annotation1'],
        },
        { type: 'text', value: 't1' },
        {
          type: 'finish-step',
          value: {
            finishReason: 'stop',
            usage: {
              inputTokens: 5,
              outputTokens: 10,
              totalTokens: 15,
              reasoningTokens: undefined,
              cachedInputTokens: undefined,
            },
            isContinued: false,
          },
        },
        {
          type: 'finish-message',
          value: {
            finishReason: 'stop',
            usage: {
              inputTokens: 5,
              outputTokens: 10,
              totalTokens: 15,
              reasoningTokens: undefined,
              cachedInputTokens: undefined,
            },
          },
        },
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
        {
          type: 'tool-call-streaming-start',
          value: {
            toolCallId: 'tool-call-0',
            toolName: 'test-tool',
          },
        },
        {
          type: 'tool-call-delta',
          value: {
            toolCallId: 'tool-call-0',
            argsTextDelta: '{"testArg":"t',
          },
        },
        {
          type: 'tool-call-delta',
          value: {
            toolCallId: 'tool-call-0',
            argsTextDelta: 'est-value"}}',
          },
        },
        {
          type: 'tool-call',
          value: {
            toolCallId: 'tool-call-0',
            toolName: 'test-tool',
            args: { testArg: 'test-value' },
          },
        },
        {
          type: 'tool-result',
          value: {
            toolCallId: 'tool-call-0',
            result: 'test-result',
          },
        },
        {
          type: 'finish-step',
          value: {
            finishReason: 'stop',
            usage: {
              inputTokens: 5,
              outputTokens: 10,
              totalTokens: 15,
              reasoningTokens: undefined,
              cachedInputTokens: undefined,
            },
            isContinued: false,
          },
        },
        {
          type: 'finish-message',
          value: {
            finishReason: 'stop',
            usage: {
              inputTokens: 5,
              outputTokens: 10,
              totalTokens: 15,
              reasoningTokens: undefined,
              cachedInputTokens: undefined,
            },
          },
        },
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
        {
          type: 'start-step',
          value: { messageId: 'step_123' },
        },
        { type: 'text', value: 'Hello, ' },
        { type: 'text', value: 'world!' },
        {
          type: 'finish-step',
          value: {
            finishReason: 'stop',
            usage: {
              inputTokens: 5,
              outputTokens: 10,
              totalTokens: 15,
              reasoningTokens: undefined,
              cachedInputTokens: undefined,
            },
            isContinued: false,
          },
        },
        {
          type: 'finish-message',
          value: {
            finishReason: 'stop',
            usage: {
              inputTokens: 5,
              outputTokens: 10,
              totalTokens: 15,
              reasoningTokens: undefined,
              cachedInputTokens: undefined,
            },
          },
        },
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
        {
          type: 'start-step',
          value: { messageId: 'step_123' },
        },
        {
          type: 'reasoning',
          value: {
            text: 'I will open the conversation',
          },
        },
        {
          type: 'reasoning',
          value: {
            text: ' with witty banter. ',
            providerMetadata: {
              testProvider: { signature: '1234567890' },
            },
          },
        },
        {
          type: 'reasoning',
          value: {
            text: 'redacted-data',
            providerMetadata: {
              testProvider: { isRedacted: true },
            },
          },
        },
        {
          type: 'reasoning',
          value: {
            text: 'Once the user has relaxed,',
          },
        },
        {
          type: 'reasoning',
          value: {
            text: ' I will pry for valuable information.',
            providerMetadata: {
              testProvider: { signature: 'abc123' },
            },
          },
        },
        { type: 'reasoning-part-finish', value: null },
        { type: 'text', value: 'Hi there!' },
        {
          type: 'finish-step',
          value: {
            finishReason: 'stop',
            usage: {
              inputTokens: 5,
              outputTokens: 10,
              totalTokens: 15,
              reasoningTokens: undefined,
              cachedInputTokens: undefined,
            },
            isContinued: false,
          },
        },
        {
          type: 'finish-message',
          value: {
            finishReason: 'stop',
            usage: {
              inputTokens: 5,
              outputTokens: 10,
              totalTokens: 15,
              reasoningTokens: undefined,
              cachedInputTokens: undefined,
            },
          },
        },
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
        {
          type: 'tool-call',
          value: {
            toolCallId: 'tool-call-id',
            toolName: 'tool-name',
            args: { city: 'London' },
          },
        },
        {
          type: 'finish-step',
          value: {
            finishReason: 'tool-calls',
            usage: {
              inputTokens: 5,
              outputTokens: 10,
              totalTokens: 15,
              reasoningTokens: undefined,
              cachedInputTokens: undefined,
            },
            isContinued: false,
          },
        },
        {
          type: 'finish-message',
          value: {
            finishReason: 'stop',
            usage: {
              inputTokens: 5,
              outputTokens: 10,
              totalTokens: 15,
              reasoningTokens: undefined,
              cachedInputTokens: undefined,
            },
          },
        },
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
        { type: 'text', value: 'The weather in London is sunny.' },
        {
          type: 'source',
          value: {
            type: 'source',
            sourceType: 'url',
            id: 'source-id',
            url: 'https://example.com',
            title: 'Example',
          },
        },
        {
          type: 'finish-step',
          value: {
            finishReason: 'stop',
            usage: {
              inputTokens: 2,
              outputTokens: 4,
              totalTokens: 6,
              reasoningTokens: undefined,
              cachedInputTokens: undefined,
            },
            isContinued: false,
          },
        },
        {
          type: 'finish-message',
          value: {
            finishReason: 'stop',
            usage: {
              inputTokens: 7,
              outputTokens: 14,
              totalTokens: 21,
              reasoningTokens: undefined,
              cachedInputTokens: undefined,
            },
          },
        },
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
        { type: 'text', value: 'Here is a file:' },
        {
          type: 'file',
          value: {
            url: 'data:text/plain;base64,SGVsbG8gV29ybGQ=',
            mediaType: 'text/plain',
          },
        },
        { type: 'text', value: 'And another one:' },
        {
          type: 'file',
          value: {
            url: 'data:application/json;base64,eyJrZXkiOiJ2YWx1ZSJ9',
            mediaType: 'application/json',
          },
        },
        {
          type: 'finish-step',
          value: {
            finishReason: 'stop',
            usage: {
              inputTokens: 2,
              outputTokens: 4,
              totalTokens: 6,
              reasoningTokens: undefined,
              cachedInputTokens: undefined,
            },
            isContinued: false,
          },
        },
        {
          type: 'finish-message',
          value: {
            finishReason: 'stop',
            usage: {
              inputTokens: 5,
              outputTokens: 10,
              totalTokens: 15,
              reasoningTokens: undefined,
              cachedInputTokens: undefined,
            },
          },
        },
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
