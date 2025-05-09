import type { UIMessage } from '../types';
import { ChatStore } from './chat-store';

describe('ChatStore', () => {
  describe('initialization', () => {
    it('initializes with a single chat', () => {
      const id = 'chat-1';
      const messages = [
        { id: '1', content: 'hello', role: 'user', parts: [] },
        { id: '2', content: 'world', role: 'assistant', parts: [] },
      ] as UIMessage[];
      const store = new ChatStore({
        chats: {
          [id]: {
            messages,
          },
        },
      });
      expect(store.getMessages(id)).toEqual(messages);
      expect(store.totalChats).toEqual(1);
    });

    it('initializes with multiple chats', () => {
      const [id1, id2] = ['chat-1', 'chat-2'];
      const [messages1, messages2] = [
        [
          { id: '1', content: 'hello', role: 'user', parts: [] },
          { id: '2', content: 'world', role: 'assistant', parts: [] },
        ] as UIMessage[],
        [
          { id: '1', content: 'beep', role: 'user', parts: [] },
          { id: '2', content: 'boop', role: 'assistant', parts: [] },
        ] as UIMessage[],
      ];
      const store = new ChatStore({
        chats: {
          [id1]: { messages: messages1 },
          [id2]: { messages: messages2 },
        },
      });
      expect(store.getMessages(id1)).toEqual(messages1);
      expect(store.getMessages(id2)).toEqual(messages2);
      expect(store.totalChats).toEqual(2);
    });

    it('initializes with empty chat store', () => {
      const store = new ChatStore();
      expect(store.totalChats).toEqual(0);
    });
  });

  describe('setMessages', () => {
    it('notifies subscribers', () => {
      const id = 'chat-1';
      const onChatMessagesChanged = vi.fn();
      const store = new ChatStore({
        chats: {
          [id]: { messages: [] },
        },
      });
      const unsubscribe = store.subscribe({
        onChatMessagesChanged,
        onChatStatusChanged: vi.fn(),
        onChatErrorChanged: vi.fn(),
      });
      const messages: UIMessage[] = [
        { id: '1', content: 'x', role: 'user', parts: [] },
        { id: '2', content: 'y', role: 'assistant', parts: [] },
        { id: '3', content: 'z', role: 'user', parts: [] },
      ];
      store.setMessages({ id, messages });
      expect(store.getMessages(id)).toEqual(messages);
      expect(onChatMessagesChanged).toHaveBeenCalledOnce();
      unsubscribe();
      store.setMessages({ id, messages: [] });
      expect(onChatMessagesChanged).toHaveBeenCalledOnce();
    });

    it('handles empty arrays', () => {
      const id = 'chat-1';
      const store = new ChatStore({
        chats: {
          [id]: {
            messages: [
              { id: '1', content: 'hello', role: 'user', parts: [] },
              { id: '2', content: 'world', role: 'assistant', parts: [] },
            ],
          },
        },
      });
      expect(store.getMessages(id)).toEqual([
        { id: '1', content: 'hello', role: 'user', parts: [] },
        { id: '2', content: 'world', role: 'assistant', parts: [] },
      ]);
      store.setMessages({ id, messages: [] });
      expect(store.getMessages(id)).toEqual([]);
    });
  });

  describe('appendMessage', () => {
    it('notifies subscribers', () => {
      const id = 'chat-1';
      const store = new ChatStore({
        chats: {
          [id]: { messages: [] },
        },
      });

      const message: UIMessage = {
        id: '1',
        content: 'hi',
        role: 'user',
        parts: [],
      };
      const onChatMessagesChanged = vi.fn();
      const unsubscribe = store.subscribe({
        onChatMessagesChanged,
        onChatStatusChanged: vi.fn(),
        onChatErrorChanged: vi.fn(),
      });

      store.appendMessage({ id, message });
      expect(store.getMessages(id)).toEqual([message]);
      expect(onChatMessagesChanged).toHaveBeenCalledOnce();

      unsubscribe();
      store.appendMessage({ id, message });
      expect(onChatMessagesChanged).toHaveBeenCalledOnce();
    });
  });

  describe('removeAssistantResponse', () => {
    it('notifies subscribers', () => {
      const id = 'chat-1';
      const messages: UIMessage[] = [
        { id: '1', content: 'lucky', role: 'user', parts: [] },
        { id: '2', content: 'vicky', role: 'assistant', parts: [] },
      ];
      const store = new ChatStore({
        chats: {
          [id]: {
            messages,
          },
        },
      });

      const onChatMessagesChanged = vi.fn();
      const unsubscribe = store.subscribe({
        onChatMessagesChanged,
        onChatStatusChanged: vi.fn(),
        onChatErrorChanged: vi.fn(),
      });

      store.removeAssistantResponse(id);
      expect(store.getMessages(id)).toEqual(messages.slice(0, 1));
      expect(onChatMessagesChanged).toHaveBeenCalledOnce();

      unsubscribe();
      store.appendMessage({ id, message: messages[1] });
      store.removeAssistantResponse(id);
      expect(onChatMessagesChanged).toHaveBeenCalledOnce();
    });

    it('throws an error if the chat is empty', () => {
      const id = 'chat-1';
      const messages: UIMessage[] = [
        { id: '1', content: 'lucky', role: 'user', parts: [] },
      ];
      const store = new ChatStore({
        chats: {
          [id]: {
            messages,
          },
        },
      });
      expect(() => store.removeAssistantResponse(id)).toThrow();
    });

    it('throws an error if the last message is not an assistant message', () => {
      const id = 'chat-1';
      const messages: UIMessage[] = [
        { id: '1', content: 'lucky', role: 'user', parts: [] },
      ];
      const store = new ChatStore({ chats: { [id]: { messages } } });
      expect(() => store.removeAssistantResponse(id)).toThrow();
    });
  });

  describe('clear', () => {
    it('notifies subscribers', () => {
      const id = 'chat-1';
      const messages: UIMessage[] = [
        { id: '1', content: 'hello', role: 'user', parts: [] },
        { id: '2', content: 'world', role: 'assistant', parts: [] },
      ];
      const store = new ChatStore({ chats: { [id]: { messages } } });
      const onChatMessagesChanged = vi.fn();
      const onChatStatusChanged = vi.fn();
      const onChatErrorChanged = vi.fn();
      const unsubscribe = store.subscribe({
        onChatMessagesChanged,
        onChatStatusChanged,
        onChatErrorChanged,
      });

      store.clear(id);
      expect(store.getMessages(id)).toEqual([]);
      expect(onChatMessagesChanged).toHaveBeenCalledOnce();
      expect(onChatStatusChanged).toHaveBeenCalledOnce();
      expect(onChatErrorChanged).toHaveBeenCalledOnce();

      unsubscribe();
      store.setMessages({ id, messages });
      store.clear();
      expect(onChatMessagesChanged).toHaveBeenCalledOnce();
      expect(onChatStatusChanged).toHaveBeenCalledOnce();
      expect(onChatErrorChanged).toHaveBeenCalledOnce();
    });

    it('clears all chats when explicit id is not provided', () => {
      const [id1, id2] = ['chat-1', 'chat-2'];
      const [messages1, messages2]: UIMessage[][] = [
        [
          { id: '1', content: 'hello', role: 'user', parts: [] },
          { id: '2', content: 'world', role: 'assistant', parts: [] },
        ],
        [
          { id: '1', content: 'hello', role: 'user', parts: [] },
          { id: '2', content: 'world', role: 'assistant', parts: [] },
        ],
      ];
      const store = new ChatStore({
        chats: {
          [id1]: { messages: messages1 },
          [id2]: { messages: messages2 },
        },
      });
      store.clear();
      expect(store.getMessages(id1)).toEqual([]);
      expect(store.getMessages(id2)).toEqual([]);
    });
  });

  describe('commitActiveResponse');

  describe('addOrUpdateAssistantMessageParts', () => {
    it('notifies subscribers', () => {
      const messages: UIMessage[] = [
        { id: '1', content: 'hello', role: 'user', parts: [] },
      ];
      const id = 'chat-1';
      const store = new ChatStore({ chats: { [id]: { messages } } });
      const onChatMessagesChanged = vi.fn();
      const unsubscribe = store.subscribe({
        onChatMessagesChanged,
        onChatStatusChanged: vi.fn(),
        onChatErrorChanged: vi.fn(),
      });

      store.addOrUpdateAssistantMessageParts({
        chatId: id,
        partDelta: { type: 'text', text: 'hi' },
      });
      expect(store.getMessages(id)).toEqual([
        { id: '1', content: 'hello', role: 'user', parts: [] },
        {
          id: expect.any(String),
          content: 'hi',
          role: 'assistant',
          createdAt: expect.any(Date),
          parts: [{ type: 'text', text: 'hi' }],
        },
      ]);
      expect(onChatMessagesChanged).toHaveBeenCalledOnce();

      unsubscribe();
      store.addOrUpdateAssistantMessageParts({
        chatId: id,
        partDelta: { type: 'text', text: ' there' },
      });
      expect(onChatMessagesChanged).toHaveBeenCalledOnce();
    });

    it('should throw if no corresponding user message is found', () => {
      const id = 'chat-1';
      const store = new ChatStore({ chats: { [id]: { messages: [] } } });
      expect(() =>
        store.addOrUpdateAssistantMessageParts({
          chatId: id,
          partDelta: { type: 'text', text: 'hi' },
        }),
      ).toThrow();
      expect(store.getMessages(id)).toEqual([]);
    });

    it('should create a new assistant message if last message was from user', () => {
      const id = 'chat-1';
      const messages: UIMessage[] = [
        { id: '1', content: 'hello', role: 'user', parts: [] },
      ];
      const store = new ChatStore({ chats: { [id]: { messages } } });
      store.addOrUpdateAssistantMessageParts({
        chatId: id,
        partDelta: { type: 'text', text: 'hi' },
      });
      expect(store.getMessages(id)).toHaveLength(2);
      expect(store.getMessages(id)?.[1]).toMatchObject({
        id: expect.any(String),
        role: 'assistant',
        content: 'hi',
        parts: [{ type: 'text', text: 'hi' }],
      });
    });

    it('should use custom id generator for new assistant message when provided', () => {
      const mockGenerateId = vi.fn().mockReturnValue('generated-id');
      const id = 'chat-1';
      const store = new ChatStore({
        chats: {
          [id]: {
            messages: [{ id: '1', content: 'hello', role: 'user', parts: [] }],
          },
        },
      });

      store.addOrUpdateAssistantMessageParts({
        chatId: id,
        partDelta: { type: 'text', text: 'hi' },
        generateId: mockGenerateId,
      });

      expect(mockGenerateId).toHaveBeenCalledOnce();
      expect(store.getMessages(id)?.[1].id).toBe('generated-id');
    });

    it('should handle multiple text parts', () => {
      const id = 'chat-1';
      const store = new ChatStore({
        chats: {
          [id]: {
            messages: [{ id: '1', content: 'hello', role: 'user', parts: [] }],
          },
        },
      });
      store.addOrUpdateAssistantMessageParts({
        chatId: id,
        partDelta: { type: 'text', text: 'Hello' },
      });
      store.addOrUpdateAssistantMessageParts({
        chatId: id,
        partDelta: { type: 'text', text: ' ' },
      });
      store.addOrUpdateAssistantMessageParts({
        chatId: id,
        partDelta: { type: 'text', text: 'world' },
      });
      const message = store.getMessages(id)?.[1];
      expect(message?.content).toBe('Hello world');
      expect(message?.parts).toHaveLength(1);
      expect(message?.parts).toEqual([{ type: 'text', text: 'Hello world' }]);
    });

    it('should handle step-start parts', () => {
      const id = 'chat-1';
      const store = new ChatStore({
        chats: {
          [id]: {
            messages: [{ id: '1', content: 'hello', role: 'user', parts: [] }],
          },
        },
      });

      const stepStart = { type: 'step-start' as const };
      store.addOrUpdateAssistantMessageParts({
        chatId: id,
        partDelta: stepStart,
      });

      expect(store.getMessages(id)?.[1].parts).toContainEqual(stepStart);
    });

    it('should handle source parts', () => {
      const id = 'chat-1';
      const store = new ChatStore({
        chats: {
          [id]: {
            messages: [{ id: '1', content: '', role: 'user', parts: [] }],
          },
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
      });
      expect(store.getMessages(id)?.[1].parts).toContainEqual(source);
    });

    it('should handle file parts', () => {
      const id = 'chat-1';
      const store = new ChatStore({
        chats: {
          [id]: {
            messages: [{ id: '1', content: '', role: 'user', parts: [] }],
          },
        },
      });
      const file = {
        type: 'file' as const,
        mediaType: 'text/plain',
        data: 'hello',
      };
      store.addOrUpdateAssistantMessageParts({
        chatId: id,
        partDelta: file,
      });
      expect(store.getMessages(id)?.[1].parts).toContainEqual(file);
    });

    // TODO: More tests for different states (partial-call, result, call)
    describe.only('tool-invocation parts', () => {
      const chatId = 'chat-1';
      const messages: UIMessage[] = [
        { id: '1', content: '', role: 'user', parts: [] },
      ];
      let store: ChatStore;

      beforeEach(() => {
        store = new ChatStore({
          chats: {
            [chatId]: { messages },
          },
        });
      });

      it('should handle call parts', () => {
        const toolInvocation = {
          type: 'tool-invocation' as const,
          toolInvocation: {
            toolCallId: 'test-id',
            toolName: 'test-tool',
            args: '{"arg": "value"}',
            state: 'call' as const,
          },
        };

        store.addOrUpdateAssistantMessageParts({
          chatId,
          partDelta: toolInvocation,
        });

        const messages = store.getMessages(chatId);
        expect(messages?.[1].parts.length).toBe(1);
        expect(messages?.[1].parts[0]).toEqual({
          ...toolInvocation,
          toolInvocation: {
            ...toolInvocation.toolInvocation,
            step: 0,
          },
        });
      });

      it('should handle partial call parts', () => {
        const toolInvocation = {
          type: 'tool-invocation' as const,
          toolInvocation: {
            toolCallId: 'test-id',
            toolName: 'test-tool',
            args: undefined,
            state: 'partial-call' as const,
          },
        };

        store.addOrUpdateAssistantMessageParts({
          chatId,
          partDelta: toolInvocation,
        });

        const messages = store.getMessages('test');
        expect(messages?.[1].parts.length).toBe(1);
        expect(messages?.[1].parts[0]).toEqual({
          ...toolInvocation,
          toolInvocation: {
            ...toolInvocation.toolInvocation,
            step: 0,
          },
        });
      });

      it('should throw if result comes before call', () => {
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

        expect(() =>
          store.addOrUpdateAssistantMessageParts({
            chatId,
            partDelta: toolInvocation,
          }),
        ).toThrow('tool_result must be preceded by a tool_call');
      });

      it('should handle result parts after call', () => {
        const toolInvocation = {
          type: 'tool-invocation' as const,
          toolInvocation: {
            toolCallId: 'test-id',
            toolName: 'test-tool',
            state: 'call' as const,
            args: '{"arg": "value"}',
          },
        };

        store.addOrUpdateAssistantMessageParts({
          chatId,
          partDelta: toolInvocation,
        });

        const messages = store.getMessages('test');
        expect(messages?.[1].parts.length).toBe(1);
        expect(messages?.[1].parts[0]).toEqual({
          ...toolInvocation,
          toolInvocation: {
            ...toolInvocation.toolInvocation,
            step: 0,
            args: '{"arg": "value"}',
            state: 'call' as const,
          },
        });

        store.addOrUpdateAssistantMessageParts({
          chatId,
          partDelta: {
            type: 'tool-invocation' as const,
            toolInvocation: {
              ...toolInvocation.toolInvocation,
              state: 'result' as const,
              result: 'some result',
            },
          },
        });

        expect(messages?.[1].parts.length).toBe(1);
        expect(messages?.[1].parts[0]).toEqual({
          ...toolInvocation,
          toolInvocation: {
            ...toolInvocation.toolInvocation,
            step: 0,
            result: 'some result',
            state: 'result' as const,
          },
        });
      });

      it('should accumulate partial-call args', () => {
        const toolInvocation = {
          type: 'tool-invocation' as const,
          toolInvocation: {
            toolCallId: 'test-id',
            toolName: 'test-tool',
            args: undefined,
            state: 'partial-call' as const,
          },
        };

        store.addOrUpdateAssistantMessageParts({
          chatId,
          partDelta: toolInvocation,
        });

        const messages = store.getMessages('test');
        expect(messages?.[1].parts.length).toBe(1);
        expect(messages?.[1].parts[0]).toEqual({
          ...toolInvocation,
          toolInvocation: {
            ...toolInvocation.toolInvocation,
            state: 'partial-call' as const,
            args: undefined,
            step: 0,
          },
        });

        store.addOrUpdateAssistantMessageParts({
          chatId,
          partDelta: {
            ...toolInvocation,
            toolInvocation: {
              ...toolInvocation.toolInvocation,
              args: '{"arg": ',
              step: 0,
            },
          },
        });

        store.addOrUpdateAssistantMessageParts({
          chatId,
          partDelta: {
            ...toolInvocation,
            toolInvocation: {
              ...toolInvocation.toolInvocation,
              args: '"value',
              step: 0,
            },
          },
        });

        store.addOrUpdateAssistantMessageParts({
          chatId,
          partDelta: {
            ...toolInvocation,
            toolInvocation: {
              ...toolInvocation.toolInvocation,
              args: '"}',
              step: 0,
            },
          },
        });

        expect(messages?.[1].parts.length).toBe(1);
        expect(messages?.[1].parts[0]).toEqual({
          ...toolInvocation,
          toolInvocation: {
            ...toolInvocation.toolInvocation,
            args: { arg: 'value' },
            step: 0,
            state: 'partial-call' as const,
          },
        });
      });

      it('should throw for invalid tool invocation state');
      it('should handle multiple tool invocations');
    });

    // TODO: More tests for redacted and signature
    it('should handle reasoning parts', () => {
      const id = 'chat-1';
      const store = new ChatStore({
        chats: {
          [id]: {
            messages: [
              { id: '1', content: '', role: 'user', parts: [] },
              { id: '2', content: '', role: 'assistant', parts: [] },
            ],
          },
        },
      });

      const reasoning = {
        type: 'reasoning' as const,
        reasoning: 'test reasoning',
        details: [{ type: 'text' as const, text: 'test reasoning' }],
      };

      store.addOrUpdateAssistantMessageParts({
        chatId: id,
        partDelta: reasoning,
      });

      const messages = store.getMessages(id);
      expect(messages?.[1].parts).toContainEqual(reasoning);
    });

    it('should throw error for invalid part type', () => {
      const id = 'chat-1';
      const store = new ChatStore({
        chats: {
          [id]: {
            messages: [{ id: '1', content: '', role: 'assistant', parts: [] }],
          },
        },
      });

      expect(() =>
        store.addOrUpdateAssistantMessageParts({
          chatId: id,
          partDelta: { type: 'invalid' as any },
        }),
      ).toThrow();
    });
  });

  describe('tool invocation handling', () => {
    it('should initialize deprecated toolInvocations array if not present', () => {
      const store = new ChatStore({
        chats: {
          test: {
            messages: [
              { id: '1', content: '', role: 'user', parts: [] },
              { id: '2', content: '', role: 'assistant', parts: [] },
            ],
          },
        },
      });

      const toolInvocation = {
        type: 'tool-invocation' as const,
        toolInvocation: {
          toolCallId: 'test-id',
          toolName: 'test-tool',
          args: '{"arg": "value"}',
          state: 'partial-call' as const,
        },
      };

      store.addOrUpdateAssistantMessageParts({
        chatId: 'test',
        partDelta: toolInvocation,
      });

      const messages = store.getMessages('test');
      expect(messages?.[1].parts).toContainEqual(toolInvocation);
    });

    it('should throw error if result comes before call', () => {
      const store = new ChatStore({
        chats: {
          test: {
            messages: [
              { id: '1', content: '', role: 'user', parts: [] },
              { id: '2', content: '', role: 'assistant', parts: [] },
            ],
          },
        },
      });

      expect(() =>
        store.addOrUpdateAssistantMessageParts({
          chatId: 'test',
          partDelta: {
            type: 'tool-invocation',
            toolInvocation: {
              toolCallId: 'test-id',
              toolName: 'test-tool',
              state: 'result' as const,
              args: undefined,
              result: 'some result',
            },
          },
        }),
      ).toThrow('tool_result must be preceded by a tool_call');
    });

    it('should accumulate partial-call args', () => {
      const store = new ChatStore({
        chats: {
          test: {
            messages: [
              { id: '1', content: '', role: 'user', parts: [] },
              { id: '2', content: '', role: 'assistant', parts: [] },
            ],
          },
        },
      });

      store.addOrUpdateAssistantMessageParts({
        chatId: 'test',
        partDelta: {
          type: 'tool-invocation',
          toolInvocation: {
            toolCallId: 'test-id',
            toolName: 'test-tool',
            args: '{"arg": "val',
            state: 'partial-call',
          },
        },
      });

      store.addOrUpdateAssistantMessageParts({
        chatId: 'test',
        partDelta: {
          type: 'tool-invocation',
          toolInvocation: {
            toolCallId: 'test-id',
            toolName: 'test-tool',
            args: 'ue"}',
            state: 'partial-call',
          },
        },
      });

      const message = store.getMessages('test')?.[1];
      expect(message?.parts[0]).toMatchObject({
        type: 'tool-invocation',
        toolInvocation: {
          toolCallId: 'test-id',
          toolName: 'test-tool',
          args: { arg: 'value' },
          state: 'partial-call',
        },
      });
    });

    it('should handle tool result after call', () => {
      const store = new ChatStore({
        chats: {
          test: {
            messages: [
              { id: '1', content: '', role: 'user', parts: [] },
              { id: '2', content: '', role: 'assistant', parts: [] },
            ],
          },
        },
      });

      store.addOrUpdateAssistantMessageParts({
        chatId: 'test',
        partDelta: {
          type: 'tool-invocation',
          toolInvocation: {
            toolCallId: 'test-id',
            toolName: 'test-tool',
            args: { arg: 'value' },
            state: 'call' as const,
          },
        },
      });

      store.addOrUpdateAssistantMessageParts({
        chatId: 'test',
        partDelta: {
          type: 'tool-invocation',
          toolInvocation: {
            toolCallId: 'test-id',
            toolName: 'test-tool',
            args: undefined,
            state: 'result' as const,
            result: 'success',
          },
        },
      });

      const message = store.getMessages('test')?.[1];
      expect(message?.parts[0]).toMatchObject({
        type: 'tool-invocation',
        toolInvocation: {
          toolCallId: 'test-id',
          toolName: 'test-tool',
          args: { arg: 'value' },
          state: 'result' as const,
          result: 'success',
        },
      });
    });

    it('should throw error for invalid tool invocation state', () => {
      const store = new ChatStore({
        chats: {
          test: {
            messages: [{ id: '1', content: '', role: 'assistant', parts: [] }],
          },
        },
      });

      expect(() =>
        store.addOrUpdateAssistantMessageParts({
          chatId: 'test',
          partDelta: {
            type: 'tool-invocation',
            toolInvocation: {
              toolCallId: 'test-id',
              toolName: 'test-tool',
              state: 'invalid' as any,
              args: undefined,
              result: undefined,
            },
          },
        }),
      ).toThrow('Invalid tool invocation state');
    });

    it('should handle multiple tool invocations', () => {
      const store = new ChatStore({
        chats: {
          test: {
            messages: [
              { id: '1', content: '', role: 'user', parts: [] },
              { id: '2', content: '', role: 'assistant', parts: [] },
            ],
          },
        },
      });

      store.addOrUpdateAssistantMessageParts({
        chatId: 'test',
        partDelta: {
          type: 'tool-invocation',
          toolInvocation: {
            toolCallId: 'tool1',
            toolName: 'test-tool',
            args: { arg: 'value1' },
            state: 'call' as const,
          },
        },
      });

      store.addOrUpdateAssistantMessageParts({
        chatId: 'test',
        partDelta: {
          type: 'tool-invocation',
          toolInvocation: {
            toolCallId: 'tool2',
            toolName: 'test-tool',
            args: { arg: 'value2' },
            state: 'call' as const,
          },
        },
      });

      const message = store.getMessages('test')?.[1];
      expect(
        message?.parts.filter((p: any) => p.type === 'tool-invocation'),
      ).toHaveLength(2);
    });
  });

  describe('reasoning handling', () => {
    it('should initialize reasoning with text detail', () => {
      const store = new ChatStore({
        chats: {
          test: {
            messages: [
              { id: '1', content: '', role: 'user', parts: [] },
              { id: '2', content: '', role: 'assistant', parts: [] },
            ],
          },
        },
      });

      store.addOrUpdateAssistantMessageParts({
        chatId: 'test',
        partDelta: {
          type: 'reasoning',
          reasoning: 'initial thought',
          providerMetadata: {},
        },
      });

      const message = store.getMessages('test')?.[1];
      expect(message?.parts[0]).toMatchObject({
        type: 'reasoning',
        reasoning: 'initial thought',
        details: [{ type: 'text', text: 'initial thought' }],
      });
      // expect(message?.parts[0].providerMetadata).toBe('initial thought');
    });

    it('should initialize reasoning with signature', () => {
      const store = new ChatStore({
        chats: {
          test: {
            messages: [
              { id: '1', content: '', role: 'user', parts: [] },
              { id: '1', content: '', role: 'assistant', parts: [] },
            ],
          },
        },
      });

      store.addOrUpdateAssistantMessageParts({
        chatId: 'test',
        partDelta: {
          type: 'reasoning',
          reasoning: '',
          providerMetadata: {},
        },
      });

      const message = store.getMessages()[1];
      expect(message.parts[0]).toMatchObject({
        type: 'reasoning',
        reasoning: '',
        details: [
          {
            type: 'text',
            text: '',
            signature: 'test-signature',
          },
        ],
      });
    });

    it('should initialize reasoning with redacted detail', () => {
      const store = new ChatStore({
        chats: {
          test: {
            messages: [
              { id: '1', content: '', role: 'user', parts: [] },
              { id: '2', content: '', role: 'assistant', parts: [] },
            ],
          },
        },
      });

      store.addOrUpdateAssistantMessageParts({
        chatId: 'test',
        partDelta: {
          type: 'reasoning',
          reasoning: '',
          providerMetadata: {},
        },
      });

      const message = store.getMessages('test')?.[1];
      expect(message?.parts[0]).toMatchObject({
        type: 'reasoning',
        reasoning: '',
        details: [
          {
            type: 'redacted',
            data: 'redacted data',
          },
        ],
      });
    });

    it('should accumulate reasoning text', () => {
      const store = new ChatStore({
        chats: {
          test: {
            messages: [
              { id: '1', content: '', role: 'user', parts: [] },
              { id: '2', content: '', role: 'assistant', parts: [] },
            ],
          },
        },
      });

      store.addOrUpdateAssistantMessageParts({
        chatId: 'test',
        partDelta: {
          type: 'reasoning',
          reasoning: 'First thought. ',
          providerMetadata: {},
        },
      });

      store.addOrUpdateAssistantMessageParts({
        chatId: 'test',
        partDelta: {
          type: 'reasoning',
          reasoning: 'Second thought.',
          providerMetadata: {},
        },
      });

      const message = store.getMessages('test')?.[1];
      expect(message?.parts[0]).toMatchObject({
        type: 'reasoning',
        reasoning: 'First thought. Second thought.',
        details: [{ type: 'text', text: 'First thought. Second thought.' }],
      });
      // expect(message.reasoning).toBe('First thought. Second thought.');
    });

    it('should update signature when provided in subsequent parts', () => {
      const store = new ChatStore({
        chats: {
          test: {
            messages: [
              { id: '1', content: '', role: 'user', parts: [] },
              { id: '2', content: '', role: 'assistant', parts: [] },
            ],
          },
        },
      });

      store.addOrUpdateAssistantMessageParts({
        chatId: 'test',
        partDelta: {
          type: 'reasoning',
          reasoning: 'Initial thought',
          // details: [],
        },
      });

      store.addOrUpdateAssistantMessageParts({
        chatId: 'test',
        partDelta: {
          type: 'reasoning',
          reasoning: '',
          // details: [
          //   {
          //     type: 'text',
          //     text: '',
          //     signature: 'late-signature',
          //   },
          // ],
        },
      });

      const message = store.getMessages('test')?.[1];
      expect(message?.parts[0]).toMatchObject({
        type: 'reasoning',
        reasoning: 'Initial thought',
        // details: [
        //   {
        //     type: 'text',
        //     text: 'Initial thought',
        //     signature: 'late-signature',
        //   },
        // ],
      });
    });

    it('should update reasoning with redacted detail', () => {
      const store = new ChatStore({
        chats: {
          test: {
            messages: [
              { id: '1', content: '', role: 'user', parts: [] },
              { id: '2', content: '', role: 'assistant', parts: [] },
            ],
          },
        },
      });

      store.addOrUpdateAssistantMessageParts({
        chatId: 'test',
        partDelta: {
          type: 'reasoning',
          reasoning: 'Initial text.',
          // details: [],
        },
      });

      store.addOrUpdateAssistantMessageParts({
        chatId: 'test',
        partDelta: {
          type: 'reasoning',
          reasoning: '',
          // details: [
          //   {
          //     type: 'redacted',
          //     data: 'redacted data',
          //   },
          // ],
        },
      });

      store.addOrUpdateAssistantMessageParts({
        chatId: 'test',
        partDelta: {
          type: 'reasoning',
          reasoning: ' Another thought.',
          // details: [],
        },
      });

      const message = store.getMessages('test')?.[1];
      expect(message?.parts[0]).toMatchObject({
        type: 'reasoning',
        reasoning: 'Initial text. Another thought.',
        // details: [
        //   { type: 'text', text: 'Initial text.' },
        //   { type: 'redacted', data: 'redacted data' },
        //   { type: 'text', text: ' Another thought.' },
        // ],
      });
    });
  });
});
