import { ChatStore, type ChatStoreEvent } from './chat-store';
import type { UIMessage } from './ui-messages';

function mockId(): () => string {
  let counter = 0;
  return () => `id-${counter++}`;
}

let onChatChangedCalls: ChatStoreEvent[] = [];

describe('ChatStore', () => {
  beforeEach(() => {
    onChatChangedCalls = [];
  });

  describe('initialization', () => {
    it('initializes with a single chat', () => {
      const id = 'chat-1';
      const messages: UIMessage[] = [
        {
          id: '1',
          role: 'user',
          parts: [{ type: 'text', text: 'hello' }],
          createdAt: new Date('2025-01-01'),
        },
        {
          id: '2',
          role: 'assistant',
          parts: [{ type: 'text', text: 'world' }],
          createdAt: new Date('2025-01-01'),
        },
      ];
      const store = new ChatStore({
        chats: {
          [id]: {
            messages,
          },
        },
        '~internal': {
          currentDate: vi.fn().mockReturnValue(new Date('2025-01-01')),
        },
      });
      expect(store.chatCount).toEqual(1);
      expect(store.getMessages(id)).toMatchSnapshot();
    });

    it('initializes with multiple chats', () => {
      const [id1, id2] = ['chat-1', 'chat-2'];
      const [messages1, messages2] = [
        [
          {
            id: '1',
            role: 'user',
            parts: [{ type: 'text', text: 'hello' }],
            createdAt: new Date('2025-01-01'),
          },
          {
            id: '2',
            role: 'assistant',
            parts: [{ type: 'text', text: 'world' }],
            createdAt: new Date('2025-01-01'),
          },
        ] as UIMessage[],
        [
          {
            id: '1',
            role: 'user',
            parts: [{ type: 'text', text: 'beep' }],
            createdAt: new Date('2025-01-01'),
          },
          {
            id: '2',
            role: 'assistant',
            parts: [{ type: 'boop', text: 'hello' }],
            createdAt: new Date('2025-01-01'),
          },
        ] as UIMessage[],
      ];
      const store = new ChatStore({
        chats: {
          [id1]: { messages: messages1 },
          [id2]: { messages: messages2 },
        },
        '~internal': {
          currentDate: vi.fn().mockReturnValue(new Date('2025-01-01')),
        },
      });
      expect(store.getMessages(id1)).toMatchSnapshot();
      expect(store.getMessages(id2)).toMatchSnapshot();
      expect(store.chatCount).toEqual(2);
    });

    it('initializes with empty chat store', () => {
      const store = new ChatStore();
      expect(store.chatCount).toEqual(0);
    });
  });

  describe('setMessages', () => {
    it('notifies subscribers', () => {
      const id = 'chat-1';
      const onChatChanged = vi.fn(args => {
        onChatChangedCalls.push(args);
      });
      const store = new ChatStore({
        chats: {
          [id]: { messages: [] },
        },
        '~internal': {
          currentDate: vi.fn().mockReturnValue(new Date('2025-01-01')),
        },
      });
      const unsubscribe = store.subscribe({
        onChatChanged,
      });
      store.setMessages({
        id,
        messages: [
          {
            id: '1',
            role: 'user',
            parts: [],
            createdAt: new Date('2025-01-01'),
          },
          {
            id: '2',
            role: 'assistant',
            parts: [],
            createdAt: new Date('2025-01-01'),
          },
          {
            id: '3',
            role: 'user',
            parts: [],
            createdAt: new Date('2025-01-01'),
          },
        ],
      });
      expect(store.getMessages(id)).toMatchSnapshot();
      expect(onChatChanged).toHaveBeenCalledOnce();
      expect(onChatChangedCalls[0]).toMatchSnapshot();
      unsubscribe();
      store.setMessages({ id, messages: [] });
      expect(onChatChanged).toHaveBeenCalledOnce();
    });

    it('handles empty arrays', () => {
      const id = 'chat-1';
      const store = new ChatStore({
        chats: {
          [id]: {
            messages: [
              {
                id: '1',
                role: 'user',
                parts: [],
                createdAt: new Date('2025-01-01'),
              },
              {
                id: '2',
                role: 'assistant',
                parts: [],
                createdAt: new Date('2025-01-01'),
              },
            ],
          },
        },
        '~internal': {
          currentDate: vi.fn().mockReturnValue(new Date('2025-01-01')),
        },
      });
      expect(store.getMessages(id)).toMatchSnapshot();
      store.setMessages({ id, messages: [] });
      expect(store.getMessages(id)).toMatchSnapshot();
    });
  });

  describe('status and error', () => {
    it('gets and sets the status of the chat', () => {
      const id = 'chat-1';
      const store = new ChatStore({
        chats: { [id]: { messages: [] } },
        '~internal': {
          currentDate: vi.fn().mockReturnValue(new Date('2025-01-01')),
        },
      });
      const onChatChanged = vi.fn(args => {
        onChatChangedCalls.push(args);
      });
      const unsubscribe = store.subscribe({
        onChatChanged,
      });
      expect(store.getStatus(id)).toEqual('ready');
      store.setStatus({ id, status: 'streaming' });
      expect(store.getStatus(id)).toEqual('streaming');
      store.setStatus({ id, status: 'error', error: new Error('test') });
      expect(store.getStatus(id)).toEqual('error');
      expect(store.getError(id)).toEqual(new Error('test'));
      store.setStatus({ id, status: 'ready' });
      expect(store.getStatus(id)).toEqual('ready');
      expect(store.getError(id)).toBeUndefined();
      expect(onChatChangedCalls).toMatchSnapshot();
      unsubscribe();
      store.setStatus({ id, status: 'streaming' });
      expect(onChatChangedCalls).toMatchSnapshot();
    });
  });

  describe('getLastMessage', () => {
    it('returns undefined for empty chat', () => {
      const id = 'chat-1';
      const store = new ChatStore({
        chats: { [id]: { messages: [] } },
      });
      expect(store.getLastMessage(id)).toBeUndefined();
    });

    it('returns the last message', () => {
      const id = 'chat-1';
      const store = new ChatStore({
        chats: {
          [id]: {
            messages: [
              { id: '1', role: 'user', parts: [] },
              { id: '2', role: 'assistant', parts: [] },
            ],
          },
        },
        '~internal': {
          currentDate: vi.fn().mockReturnValue(new Date('2025-01-01')),
        },
      });
      expect(store.getLastMessage(id)).toMatchSnapshot();
    });
  });

  describe('updateActiveResponse', () => {
    it('notifies subscribers', () => {
      const id = 'chat-1';
      const store = new ChatStore({
        chats: { [id]: { messages: [{ id: '1', role: 'user', parts: [] }] } },
        '~internal': {
          currentDate: vi.fn().mockReturnValue(new Date('2025-01-01')),
        },
      });
      const onChatChanged = vi.fn(args => {
        onChatChangedCalls.push(args);
      });
      const unsubscribe = store.subscribe({
        onChatChanged,
      });
      store.updateActiveResponse({
        chatId: id,
        message: {
          id: '1',
          role: 'assistant',
          parts: [{ type: 'text', text: 'hello' }],
          createdAt: new Date('2025-01-01'),
        },
        generateId: mockId(),
      });
      expect(onChatChanged).toHaveBeenCalledOnce();
      expect(onChatChangedCalls).toMatchSnapshot();
      unsubscribe();
      store.updateActiveResponse({
        chatId: id,
        message: {
          id: '1',
          role: 'assistant',
          parts: [{ type: 'text', text: 'hello' }],
          createdAt: new Date('2025-01-01'),
        },
        generateId: mockId(),
      });
      expect(onChatChanged).toHaveBeenCalledOnce();
      expect(onChatChangedCalls).toMatchSnapshot();
    });

    it('initializes new active response if none exists', () => {
      const id = 'chat-1';
      const store = new ChatStore({
        chats: { [id]: { messages: [{ id: '1', role: 'user', parts: [] }] } },
        '~internal': {
          currentDate: vi.fn().mockReturnValue(new Date('2025-01-01')),
        },
      });
      store.updateActiveResponse({
        chatId: id,
        message: {
          id: '2',
          role: 'assistant',
          parts: [{ type: 'text', text: 'hello' }],
          createdAt: new Date('2025-01-01'),
        },
        generateId: mockId(),
      });
      expect(store.getMessages(id)).toMatchSnapshot();
    });

    it('merges current active response with partial message', () => {
      const id = 'chat-1';
      const store = new ChatStore({
        chats: { [id]: { messages: [{ id: '1', role: 'user', parts: [] }] } },
        '~internal': {
          currentDate: vi.fn().mockReturnValue(new Date('2025-01-01')),
        },
      });
      store.addOrUpdateAssistantMessageParts({
        chatId: id,
        partDelta: { type: 'text', text: 'hello' },
        generateId: mockId(),
      });
      store.updateActiveResponse({
        chatId: id,
        message: {
          annotations: [
            {
              foo: 'bar',
            },
          ],
        },
        generateId: mockId(),
      });
      expect(store.getMessages(id)).toMatchSnapshot();
    });
  });

  describe('appendMessage', () => {
    it('notifies subscribers', () => {
      const id = 'chat-1';
      const store = new ChatStore({
        chats: {
          [id]: { messages: [] },
        },
        '~internal': {
          currentDate: vi.fn().mockReturnValue(new Date('2025-01-01')),
        },
      });

      const onChatChanged = vi.fn();
      const unsubscribe = store.subscribe({
        onChatChanged,
      });

      store.appendMessage({
        id,
        message: {
          id: '1',
          role: 'user',
          parts: [],
          createdAt: new Date('2025-01-01'),
        },
      });
      expect(store.getMessages(id)).toMatchSnapshot();
      expect(onChatChanged).toHaveBeenCalledOnce();

      unsubscribe();
      store.appendMessage({
        id,
        message: {
          id: '2',
          role: 'assistant',
          parts: [],
          createdAt: new Date('2025-01-01'),
        },
      });
      expect(onChatChanged).toHaveBeenCalledOnce();
    });
  });

  describe('removeAssistantResponse', () => {
    it('notifies subscribers', () => {
      const id = 'chat-1';
      const messages: UIMessage[] = [
        { id: '1', role: 'user', parts: [], createdAt: new Date('2025-01-01') },
        {
          id: '2',
          role: 'assistant',
          parts: [],
          createdAt: new Date('2025-01-01'),
        },
      ];
      const store = new ChatStore({
        chats: {
          [id]: {
            messages,
          },
        },
        '~internal': {
          currentDate: vi.fn().mockReturnValue(new Date('2025-01-01')),
        },
      });

      const onChatChanged = vi.fn(args => {
        onChatChangedCalls.push(args);
      });
      const unsubscribe = store.subscribe({
        onChatChanged,
      });

      store.removeAssistantResponse(id);
      expect(store.getMessages(id)).toMatchSnapshot();
      expect(onChatChanged).toHaveBeenCalledOnce();
      expect(onChatChangedCalls).toMatchSnapshot();
      unsubscribe();
      store.appendMessage({ id, message: messages[1] });
      store.removeAssistantResponse(id);
      expect(onChatChanged).toHaveBeenCalledOnce();
      expect(onChatChangedCalls).toMatchSnapshot();
    });

    it('throws an error if the chat is empty', () => {
      const id = 'chat-1';
      const store = new ChatStore({
        chats: {
          [id]: {
            messages: [
              {
                id: '1',
                role: 'user',
                parts: [],
                createdAt: new Date('2025-01-01'),
              },
            ],
          },
        },
        '~internal': {
          currentDate: vi.fn().mockReturnValue(new Date('2025-01-01')),
        },
      });
      expect(() => store.removeAssistantResponse(id)).toThrow();
    });

    it('throws an error if the last message is not an assistant message', () => {
      const id = 'chat-1';
      const store = new ChatStore({
        chats: {
          [id]: {
            messages: [
              {
                id: '1',
                role: 'user',
                parts: [],
                createdAt: new Date('2025-01-01'),
              },
            ],
          },
        },
        '~internal': {
          currentDate: vi.fn().mockReturnValue(new Date('2025-01-01')),
        },
      });
    });
  });

  describe('clear', () => {
    it('notifies subscribers', () => {
      const id = 'chat-1';
      const messages: UIMessage[] = [
        { id: '1', role: 'user', parts: [], createdAt: new Date('2025-01-01') },
        {
          id: '2',
          role: 'assistant',
          parts: [],
          createdAt: new Date('2025-01-01'),
        },
      ];
      const store = new ChatStore({
        chats: { [id]: { messages } },
        '~internal': {
          currentDate: vi.fn().mockReturnValue(new Date('2025-01-01')),
        },
      });
      const onChatChanged = vi.fn(args => {
        onChatChangedCalls.push(args);
      });
      const unsubscribe = store.subscribe({
        onChatChanged,
      });

      store.clear(id);
      expect(store.getMessages(id)).toMatchSnapshot();
      expect(onChatChanged).toHaveBeenCalledOnce();
      expect(onChatChangedCalls).toMatchSnapshot();
      unsubscribe();
      store.setMessages({ id, messages });
      store.clear();
      expect(onChatChanged).toHaveBeenCalledOnce();
    });

    it('clears all chats when explicit id is not provided', () => {
      const [id1, id2] = ['chat-1', 'chat-2'];
      const [messages1, messages2]: UIMessage[][] = [
        [
          {
            id: '1',
            role: 'user',
            parts: [],
            createdAt: new Date('2025-01-01'),
          },
          {
            id: '2',
            role: 'assistant',
            parts: [],
            createdAt: new Date('2025-01-01'),
          },
        ],
        [
          {
            id: '1',
            role: 'user',
            parts: [],
            createdAt: new Date('2025-01-01'),
          },
          {
            id: '2',
            role: 'assistant',
            parts: [],
            createdAt: new Date('2025-01-01'),
          },
        ],
      ];
      const store = new ChatStore({
        chats: {
          [id1]: { messages: messages1 },
          [id2]: { messages: messages2 },
        },
        '~internal': {
          currentDate: vi.fn().mockReturnValue(new Date('2025-01-01')),
        },
      });
      const onChatChanged = vi.fn(args => {
        onChatChangedCalls.push(args);
      });
      store.subscribe({
        onChatChanged,
      });
      store.clear();
      expect(store.getMessages(id1)).toMatchSnapshot();
      expect(onChatChanged).toHaveBeenCalledTimes(2);
      expect(onChatChangedCalls).toMatchSnapshot();
    });

    it('clears active response state if it exists', () => {
      const id = 'chat-1';
      const messages: UIMessage[] = [
        { id: '1', role: 'user', parts: [], createdAt: new Date('2025-01-01') },
      ];
      const store = new ChatStore({
        chats: { [id]: { messages } },
        '~internal': {
          currentDate: vi.fn().mockReturnValue(new Date('2025-01-01')),
        },
      });
      store.updateActiveResponse({
        chatId: id,
        message: {
          id: '1',
          role: 'assistant',
          parts: [],
          createdAt: new Date('2025-01-01'),
        },
        generateId: mockId(),
      });
      const onChatChanged = vi.fn(args => {
        onChatChangedCalls.push(args);
      });
      store.subscribe({
        onChatChanged,
      });
      store.clear(id);
      expect(onChatChanged).toHaveBeenCalledTimes(2);
      expect(onChatChangedCalls).toMatchSnapshot();
    });
  });

  describe('addOrUpdateAssistantMessageParts', () => {
    it('notifies subscribers', () => {
      const messages: UIMessage[] = [
        { id: '1', role: 'user', parts: [], createdAt: new Date('2025-01-01') },
      ];
      const id = 'chat-1';
      const store = new ChatStore({
        chats: { [id]: { messages } },
        '~internal': {
          currentDate: vi.fn().mockReturnValue(new Date('2025-01-01')),
        },
      });
      const onChatChanged = vi.fn();
      const unsubscribe = store.subscribe({
        onChatChanged,
      });

      store.addOrUpdateAssistantMessageParts({
        chatId: id,
        partDelta: { type: 'text', text: 'hi' },
        generateId: mockId(),
      });
      expect(store.getMessages(id)).toMatchSnapshot();
      expect(onChatChanged).toHaveBeenCalledOnce();

      unsubscribe();
      store.addOrUpdateAssistantMessageParts({
        chatId: id,
        partDelta: { type: 'text', text: ' there' },
        generateId: mockId(),
      });
      expect(onChatChanged).toHaveBeenCalledOnce();
    });

    it('should throw if no corresponding user message is found', async () => {
      const id = 'chat-1';
      const store = new ChatStore({
        chats: { [id]: { messages: [] } },
        '~internal': {
          currentDate: vi.fn().mockReturnValue(new Date('2025-01-01')),
        },
      });
      await expect(
        store.addOrUpdateAssistantMessageParts({
          chatId: id,
          partDelta: { type: 'text', text: 'hi' },
          generateId: mockId(),
        }),
      ).rejects.toThrow();
      expect(store.getMessages(id)).toMatchSnapshot();
    });

    it('should create a new assistant message', () => {
      const id = 'chat-1';
      const store = new ChatStore({
        chats: {
          [id]: {
            messages: [
              {
                id: '1',
                role: 'user',
                parts: [],
                createdAt: new Date('2025-01-01'),
              },
            ],
          },
        },
        '~internal': {
          currentDate: vi.fn().mockReturnValue(new Date('2025-01-01')),
        },
      });
      store.addOrUpdateAssistantMessageParts({
        chatId: id,
        partDelta: { type: 'text', text: 'hi' },
        generateId: mockId(),
      });
      expect(store.getMessages(id)).toMatchSnapshot();
    });

    it('should handle multiple text parts', () => {
      const id = 'chat-1';
      const store = new ChatStore({
        chats: {
          [id]: {
            messages: [{ id: '1', role: 'user', parts: [] }],
          },
        },
        '~internal': {
          currentDate: vi.fn().mockReturnValue(new Date('2025-01-01')),
        },
      });
      const generateId = mockId();
      store.addOrUpdateAssistantMessageParts({
        chatId: id,
        partDelta: { type: 'text', text: 'Hello' },
        generateId,
      });
      store.addOrUpdateAssistantMessageParts({
        chatId: id,
        partDelta: { type: 'text', text: ' ' },
        generateId,
      });
      store.addOrUpdateAssistantMessageParts({
        chatId: id,
        partDelta: { type: 'text', text: 'world' },
        generateId,
      });
      expect(store.getMessages(id)?.[1]).toMatchSnapshot();
    });

    it('should handle step-start parts', () => {
      const id = 'chat-1';
      const store = new ChatStore({
        chats: {
          [id]: {
            messages: [{ id: '1', role: 'user', parts: [] }],
          },
        },
        '~internal': {
          currentDate: vi.fn().mockReturnValue(new Date('2025-01-01')),
        },
      });

      const stepStart = { type: 'step-start' as const };
      store.addOrUpdateAssistantMessageParts({
        chatId: id,
        partDelta: stepStart,
        generateId: mockId(),
      });

      expect(store.getMessages(id)?.[1]).toMatchSnapshot();
    });

    it('should handle source parts', () => {
      const id = 'chat-1';
      const store = new ChatStore({
        chats: {
          [id]: {
            messages: [{ id: '1', role: 'user', parts: [] }],
          },
        },
        '~internal': {
          currentDate: vi.fn().mockReturnValue(new Date('2025-01-01')),
        },
      });
      const source = {
        type: 'source' as const,
        source: {
          type: 'source' as const,
          sourceType: 'url' as const,
          id: '1',
          url: 'https://example.com',
        },
      };
      store.addOrUpdateAssistantMessageParts({
        chatId: id,
        partDelta: source,
        generateId: mockId(),
      });
      expect(store.getMessages(id)?.[1]).toMatchSnapshot();
    });

    it('should handle file parts', () => {
      const id = 'chat-1';
      const store = new ChatStore({
        chats: {
          [id]: {
            messages: [{ id: '1', role: 'user', parts: [] }],
          },
        },
        '~internal': {
          currentDate: vi.fn().mockReturnValue(new Date('2025-01-01')),
        },
      });
      const file = {
        type: 'file' as const,
        mediaType: 'text/plain',
        url: 'https://example.com/hello.txt',
      };
      store.addOrUpdateAssistantMessageParts({
        chatId: id,
        partDelta: file,
        generateId: mockId(),
      });
      expect(store.getMessages(id)?.[1]).toMatchSnapshot();
    });
  });

  describe('tool invocation handling', () => {
    const chatId = 'chat-1';
    const messages: UIMessage[] = [{ id: '1', role: 'user', parts: [] }];
    let store: ChatStore;

    beforeEach(() => {
      store = new ChatStore({
        chats: {
          [chatId]: { messages },
        },
        '~internal': {
          currentDate: vi.fn().mockReturnValue(new Date('2025-01-01')),
        },
      });
    });

    it('should handle call part', async () => {
      const toolInvocation = {
        type: 'tool-invocation' as const,
        toolInvocation: {
          toolCallId: 'test-id',
          toolName: 'test-tool',
          args: { arg: 'value' },
          state: 'call' as const,
        },
      };

      await store.addOrUpdateAssistantMessageParts({
        chatId,
        partDelta: toolInvocation,
        generateId: mockId(),
      });

      const messages = store.getMessages(chatId);
      expect(messages?.[1]).toMatchSnapshot();
    });

    it('should handle multiple call parts', async () => {
      const generateId = mockId();
      const toolInvocation = {
        type: 'tool-invocation' as const,
        toolInvocation: {
          toolCallId: 'test-id',
          toolName: 'test-tool',
          args: 'arg',
          state: 'call' as const,
        },
      };

      const toolInvocation2 = {
        type: 'tool-invocation' as const,
        toolInvocation: {
          toolCallId: 'test-id-2',
          toolName: 'test-tool-2',
          args: { arg: 'value-2' },
          state: 'call' as const,
        },
      };

      await store.addOrUpdateAssistantMessageParts({
        chatId,
        partDelta: toolInvocation,
        generateId,
      });

      await store.addOrUpdateAssistantMessageParts({
        chatId,
        partDelta: toolInvocation2,
        generateId,
      });

      const messages = store.getMessages(chatId);
      expect(messages?.[1]).toMatchSnapshot();
    });

    it('should handle partial call part', async () => {
      const toolInvocation = {
        type: 'tool-invocation' as const,
        toolInvocation: {
          toolCallId: 'test-id',
          toolName: 'test-tool',
          args: undefined,
          state: 'partial-call' as const,
        },
      };

      await store.addOrUpdateAssistantMessageParts({
        chatId,
        partDelta: toolInvocation,
        generateId: mockId(),
      });

      const messages = store.getMessages(chatId);
      expect(messages?.[1]).toMatchSnapshot();
    });

    it('should handle multiple partial call parts', async () => {
      const generateId = mockId();
      await store.addOrUpdateAssistantMessageParts({
        chatId,
        partDelta: {
          type: 'tool-invocation' as const,
          toolInvocation: {
            toolCallId: 'test-id',
            toolName: 'test-tool',
            args: undefined,
            state: 'partial-call' as const,
          },
        },
        generateId,
      });

      await store.addOrUpdateAssistantMessageParts({
        chatId,
        partDelta: {
          type: 'tool-invocation' as const,
          toolInvocation: {
            toolCallId: 'test-id',
            toolName: 'test-tool',
            args: '{"arg": "',
            state: 'partial-call' as const,
          },
        },
        generateId,
      });

      await store.addOrUpdateAssistantMessageParts({
        chatId,
        partDelta: {
          type: 'tool-invocation' as const,
          toolInvocation: {
            toolCallId: 'test-id',
            toolName: 'test-tool',
            args: 'value',
            state: 'partial-call' as const,
          },
        },
        generateId,
      });

      await store.addOrUpdateAssistantMessageParts({
        chatId,
        partDelta: {
          type: 'tool-invocation' as const,
          toolInvocation: {
            toolCallId: 'test-id',
            toolName: 'test-tool',
            args: '"}',
            state: 'partial-call' as const,
          },
        },
        generateId,
      });

      const messages = store.getMessages(chatId);
      expect(messages?.[1]).toMatchSnapshot();
    });

    it('should throw if result comes before call', async () => {
      const toolInvocation = {
        type: 'tool-invocation' as const,
        toolInvocation: {
          toolCallId: 'test-id',
          toolName: 'test-tool',
          state: 'result' as const,
          result: 'some result',
          args: undefined,
        },
      };

      await expect(async () =>
        store.addOrUpdateAssistantMessageParts({
          chatId,
          partDelta: toolInvocation,
          generateId: mockId(),
        }),
      ).rejects.toThrow('tool_result must be preceded by a tool_call');
    });

    it('should handle result parts after call', async () => {
      const generateId = mockId();
      const toolInvocation = {
        type: 'tool-invocation' as const,
        toolInvocation: {
          toolCallId: 'test-id',
          toolName: 'test-tool',
          state: 'call' as const,
          args: { foo: 'bar' },
        },
      };

      await store.addOrUpdateAssistantMessageParts({
        chatId,
        partDelta: toolInvocation,
        generateId,
      });

      const messages = store.getMessages(chatId);
      expect(messages).toMatchSnapshot();

      await store.addOrUpdateAssistantMessageParts({
        chatId,
        partDelta: {
          type: 'tool-invocation' as const,
          toolInvocation: {
            ...toolInvocation.toolInvocation,
            state: 'result' as const,
            result: 'some result',
          },
        },
        generateId,
      });

      expect(messages?.[1]).toMatchSnapshot();
    });

    it('should throw for invalid tool invocation state', async () => {
      await expect(async () =>
        store.addOrUpdateAssistantMessageParts({
          chatId,
          partDelta: {
            type: 'tool-invocation' as const,
            toolInvocation: {
              // @ts-expect-error
              state: 'invalid',
            },
          },
          generateId: mockId(),
        }),
      ).rejects.toThrow('Invalid tool invocation state');
    });

    it('should handle multiple tool invocations', async () => {
      const generateId = mockId();
      await store.addOrUpdateAssistantMessageParts({
        chatId,
        partDelta: {
          type: 'tool-invocation' as const,
          toolInvocation: {
            toolCallId: 'test-id',
            toolName: 'test-tool',
            state: 'call' as const,
            args: { foo: 'bar' },
          },
        },
        generateId,
      });

      await store.addOrUpdateAssistantMessageParts({
        chatId,
        partDelta: {
          type: 'tool-invocation' as const,
          toolInvocation: {
            toolCallId: 'test-id',
            toolName: '',
            state: 'result' as const,
            result: 'first result',
            args: undefined,
          },
        },
        generateId,
      });

      await store.addOrUpdateAssistantMessageParts({
        chatId,
        partDelta: {
          type: 'tool-invocation' as const,
          toolInvocation: {
            toolCallId: 'test-id-2',
            toolName: 'test-tool-2',
            state: 'call' as const,
            args: { baz: 'qux' },
          },
        },
        generateId,
      });

      await store.addOrUpdateAssistantMessageParts({
        chatId,
        partDelta: {
          type: 'tool-invocation' as const,
          toolInvocation: {
            toolCallId: 'test-id-2',
            toolName: 'test-tool-2',
            state: 'result' as const,
            result: 'second result',
            args: undefined,
          },
        },
        generateId,
      });

      const messages = store.getMessages(chatId);
      expect(messages?.[1]).toMatchSnapshot();
    });
  });

  describe('reasoning handling', () => {
    const chatId = 'chat-1';
    const messages: UIMessage[] = [{ id: '1', role: 'user', parts: [] }];
    let store: ChatStore;

    beforeEach(() => {
      store = new ChatStore({
        chats: {
          [chatId]: { messages },
        },
        '~internal': {
          currentDate: vi.fn().mockReturnValue(new Date('2025-01-01')),
        },
      });
    });

    it('should initialize reasoning with text detail', () => {
      store.addOrUpdateAssistantMessageParts({
        chatId,
        partDelta: {
          type: 'reasoning',
          text: 'initial thought',
          providerMetadata: {},
        },
        generateId: mockId(),
      });

      const message = store.getMessages(chatId)?.[1];
      expect(message).toMatchSnapshot();
    });

    it('should initialize reasoning with signature', () => {
      store.addOrUpdateAssistantMessageParts({
        chatId,
        partDelta: {
          type: 'reasoning',
          text: '',
          providerMetadata: {
            provider: { signature: 'abc123' },
          },
        },
        generateId: mockId(),
      });

      const message = store.getMessages(chatId)?.[1];
      expect(message).toMatchSnapshot();
    });

    it('should initialize reasoning with redacted detail', () => {
      store.addOrUpdateAssistantMessageParts({
        chatId,
        partDelta: {
          type: 'reasoning',
          text: 'redacted-data',
          providerMetadata: {
            provider: { isRedacted: true },
          },
        },
        generateId: mockId(),
      });

      const message = store.getMessages(chatId)?.[1];
      expect(message).toMatchSnapshot();
    });

    it('should accumulate reasoning text', () => {
      const generateId = mockId();
      store.addOrUpdateAssistantMessageParts({
        chatId,
        partDelta: {
          type: 'reasoning',
          text: 'First thought. ',
          providerMetadata: {},
        },
        generateId,
      });

      store.addOrUpdateAssistantMessageParts({
        chatId,
        partDelta: {
          type: 'reasoning',
          text: 'Second thought.',
          providerMetadata: {},
        },
        generateId,
      });

      const message = store.getMessages(chatId)?.[1];
      expect(message).toMatchSnapshot();
    });

    it('should update signature when provided in subsequent parts', () => {
      const generateId = mockId();
      store.addOrUpdateAssistantMessageParts({
        chatId,
        partDelta: {
          type: 'reasoning',
          text: 'Initial thought',
          providerMetadata: {},
        },
        generateId,
      });

      store.addOrUpdateAssistantMessageParts({
        chatId,
        partDelta: {
          type: 'reasoning',
          text: '',
          providerMetadata: {
            provider: { signature: 'late-signature' },
          },
        },
        generateId,
      });

      const message = store.getMessages(chatId)?.[1];
      expect(message).toMatchSnapshot();
    });

    it('should update reasoning with redacted detail', () => {
      const generateId = mockId();
      store.addOrUpdateAssistantMessageParts({
        chatId,
        partDelta: {
          type: 'reasoning',
          text: 'Initial text.',
          providerMetadata: {},
        },
        generateId,
      });

      store.addOrUpdateAssistantMessageParts({
        chatId,
        partDelta: {
          type: 'reasoning',
          text: 'redacted-data',
          providerMetadata: {
            provider: { isRedacted: true },
          },
        },
        generateId,
      });

      store.addOrUpdateAssistantMessageParts({
        chatId,
        partDelta: {
          type: 'reasoning',
          text: 'Another thought.',
          providerMetadata: {},
        },
        generateId,
      });

      const message = store.getMessages(chatId)?.[1];
      expect(message).toMatchSnapshot();
    });
  });
});
