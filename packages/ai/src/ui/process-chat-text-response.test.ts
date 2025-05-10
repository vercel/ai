import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { beforeEach, describe, expect, it, MockInstance } from 'vitest';
import { ChatStore } from '../..';
import { processChatTextResponse } from './process-chat-text-response';
import { UIMessage } from './ui-messages';

function createTextStream(chunks: string[]): ReadableStream<Uint8Array> {
  return convertArrayToReadableStream(chunks).pipeThrough(
    new TextEncoderStream(),
  );
}

let updateDataCalls: any[] = [];

let finishCallMessages: UIMessage[] = [];

const updateData = (data?: any[]) => {
  // clone to preserve the original object
  if (data) updateDataCalls.push(structuredClone(data));
};

const onFinish = (message: UIMessage) => {
  // store the final message
  finishCallMessages.push(structuredClone(message));
};

function mockId(): string {
  // a simple predictable ID generator
  return 'test-id';
}

const chatId = 'chat-id';
let store: ChatStore;
let storeSpy: MockInstance<
  ({
    chatId,
    partDelta,
    messageId,
  }: {
    chatId: string;
    partDelta: UIMessage['parts'][number];
    messageId?: string;
  }) => Promise<void>
>;

beforeEach(() => {
  updateDataCalls = [];
  finishCallMessages = [];
});

describe('processChatTextResponse', () => {
  describe('scenario: simple text response', () => {
    beforeEach(async () => {
      store = new ChatStore({
        chats: {
          [chatId]: {
            messages: [
              {
                id: 'user-message-id',
                role: 'user',
                parts: [{ type: 'text', text: 'Hello, world!' }],
              },
            ],
          },
        },
        generateId: mockId,
        getCurrentDate: vi.fn().mockReturnValue(new Date('2023-01-01')),
      });
      storeSpy = vi.spyOn(store, 'addOrUpdateAssistantMessageParts');

      const stream = createTextStream(['Hello, ', 'world!']);

      await processChatTextResponse({
        stream,
        updateData,
        onFinish,
        store,
        chatId,
      });
    });

    it('should call the addOrUpdateAssistantMessageParts function with the correct arguments', () => {
      expect(storeSpy.mock.calls).toMatchSnapshot();
    });

    it('should call the updateData function with the correct arguments', () => {
      expect(updateDataCalls).toMatchSnapshot();
    });

    it('should call the onFinish function after the stream ends', () => {
      expect(finishCallMessages).toMatchSnapshot();
    });
  });

  describe('scenario: no text chunks', () => {
    beforeEach(async () => {
      store = new ChatStore({
        chats: {
          [chatId]: {
            messages: [
              {
                id: 'user-message-id',
                role: 'user',
                parts: [{ type: 'text', text: 'Hola' }],
              },
            ],
          },
        },
        generateId: mockId,
        getCurrentDate: vi.fn().mockReturnValue(new Date('2023-01-01')),
      });
      storeSpy = vi.spyOn(store, 'addOrUpdateAssistantMessageParts');
      const stream = createTextStream([]);

      await processChatTextResponse({
        stream,
        updateData,
        onFinish,
        store,
        chatId,
      });
    });

    it('should not call the addOrUpdateAssistantMessageParts function', () => {
      expect(storeSpy.mock.calls).toMatchSnapshot();
    });

    it('should call the updateData function with the correct arguments', () => {
      expect(updateDataCalls).toMatchSnapshot();
    });

    it('should call the onFinish function after the stream ends', () => {
      expect(finishCallMessages).toMatchSnapshot();
    });
  });

  describe('scenario: multiple short chunks', () => {
    beforeEach(async () => {
      store = new ChatStore({
        chats: {
          [chatId]: {
            messages: [
              {
                id: 'user-message-id',
                role: 'user',
                parts: [{ type: 'text', text: 'Hello, world!' }],
              },
            ],
          },
        },
        generateId: mockId,
        getCurrentDate: vi.fn().mockReturnValue(new Date('2023-01-01')),
      });
      storeSpy = vi.spyOn(store, 'addOrUpdateAssistantMessageParts');
      const stream = createTextStream(['A', 'B', 'C', 'D', 'E']);

      await processChatTextResponse({
        stream,
        updateData,
        onFinish,
        store,
        chatId,
      });
    });

    it('should call the addOrUpdateAssistantMessageParts function with the correct arguments', () => {
      expect(storeSpy.mock.calls).toMatchSnapshot();
    });

    it('should call the updateData function with the correct arguments', () => {
      expect(updateDataCalls).toMatchSnapshot();
    });

    it('should call the onFinish function after the stream ends', () => {
      expect(finishCallMessages).toMatchSnapshot();
    });
  });
});
