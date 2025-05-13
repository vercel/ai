import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { beforeEach, describe, expect, it, MockInstance } from 'vitest';
import { ChatStore } from './chat-store';
import { processChatTextResponse } from './process-chat-text-response';
import { UIMessage } from './ui-messages';

function createTextStream(chunks: string[]): ReadableStream<Uint8Array> {
  return convertArrayToReadableStream(chunks).pipeThrough(
    new TextEncoderStream(),
  );
}

let finishCallMessages: UIMessage[] = [];

const onFinish = () => {
  // TODO-FIX: store the final message
  finishCallMessages.push();
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
        '~internal': {
          currentDate: vi.fn().mockReturnValue(new Date('2025-01-01')),
        },
      });
      storeSpy = vi.spyOn(store, 'addOrUpdateAssistantMessageParts');

      const stream = createTextStream(['Hello, ', 'world!']);

      await processChatTextResponse({
        stream,
        onFinish,
        store,
        chatId,
        generateId: () => mockId(),
      });
    });

    it('should call the addOrUpdateAssistantMessageParts function with the correct arguments', () => {
      expect(storeSpy.mock.calls).toMatchSnapshot();
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
        '~internal': {
          currentDate: vi.fn().mockReturnValue(new Date('2025-01-01')),
        },
      });
      storeSpy = vi.spyOn(store, 'addOrUpdateAssistantMessageParts');
      const stream = createTextStream([]);

      await processChatTextResponse({
        stream,
        onFinish,
        store,
        chatId,
        generateId: () => mockId(),
      });
    });

    it('should not call the addOrUpdateAssistantMessageParts function', () => {
      expect(storeSpy.mock.calls).toMatchSnapshot();
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
        '~internal': {
          currentDate: vi.fn().mockReturnValue(new Date('2025-01-01')),
        },
      });
      storeSpy = vi.spyOn(store, 'addOrUpdateAssistantMessageParts');
      const stream = createTextStream(['A', 'B', 'C', 'D', 'E']);

      await processChatTextResponse({
        stream,
        onFinish,
        store,
        chatId,
        generateId: () => mockId(),
      });
    });

    it('should call the addOrUpdateAssistantMessageParts function with the correct arguments', () => {
      expect(storeSpy.mock.calls).toMatchSnapshot();
    });

    it('should call the onFinish function after the stream ends', () => {
      expect(finishCallMessages).toMatchSnapshot();
    });
  });
});
