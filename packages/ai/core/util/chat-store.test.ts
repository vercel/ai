import { describe, expect, it, vi } from 'vitest';
import type { UIMessage } from '../types';
import { ChatStore } from './chat-store';

const initChat = (messages?: UIMessage[]) => {
  const store = new ChatStore({ initialMessages: messages });
  const defaultChatId = store.getChatId();
  return { store, defaultChatId };
};

describe('ChatStore', () => {
  describe('initialization', () => {
    it('initializes with initialMessages', () => {
      const initialMessages = [
        { id: '1', content: 'hello', role: 'user', parts: [] },
        { id: '2', content: 'world', role: 'assistant', parts: [] },
      ] as UIMessage[];
      const { store, defaultChatId } = initChat(initialMessages);
      expect(defaultChatId).toBeDefined();
      expect(store.getMessages()).toEqual(initialMessages);
    });

    it('initializes with empty chat when initialMessages is not provided', () => {
      const { store, defaultChatId } = initChat();
      expect(defaultChatId).toBeDefined();
      expect(store.getMessages()).toEqual([]);
    });
  });

  describe('setMessages', () => {
    it('notifies subscribers', () => {
      const callback = vi.fn();
      const { store } = initChat();
      const unsubscribe = store.subscribe({
        onChatMessagesChanged: callback,
      });
      const msgs: UIMessage[] = [
        { id: '1', content: 'x', role: 'user', parts: [] },
        { id: '2', content: 'y', role: 'assistant', parts: [] },
        { id: '3', content: 'z', role: 'user', parts: [] },
      ];
      store.setMessages(msgs);
      expect(store.getMessages()).toEqual(msgs);
      expect(callback).toHaveBeenCalledOnce();
      unsubscribe();
      store.setMessages(msgs);
      expect(callback).toHaveBeenCalledOnce();
    });

    it('handles empty arrays', () => {
      const { store } = initChat([
        { id: '1', content: 'hello', role: 'user', parts: [] },
        { id: '2', content: 'world', role: 'assistant', parts: [] },
      ]);
      expect(store.getMessages().length).toEqual(2);
      store.setMessages([]);
      expect(store.getMessages().length).toEqual(0);
    });
  });

  describe('appendMessage', () => {
    it('notifies subscribers', () => {
      const { store } = initChat();
      const msg: UIMessage = {
        id: '1',
        content: 'hi',
        role: 'user',
        parts: [],
      };
      const callback = vi.fn();
      const unsubscribe = store.subscribe({
        onChatMessagesChanged: callback,
      });

      store.appendMessage(msg);
      expect(store.getMessages()).toEqual([msg]);
      expect(callback).toHaveBeenCalledOnce();

      unsubscribe();
      store.appendMessage(msg);
      expect(callback).toHaveBeenCalledOnce();
    });
  });

  describe('updateLastMessage', () => {
    it('notifies subscribers', () => {
      const { store } = initChat([
        { id: '1', content: 'hello', role: 'user', parts: [] },
        { id: '2', content: 'world', role: 'assistant', parts: [] },
      ]);
      const msg: UIMessage = {
        id: '2',
        content: 'universe',
        role: 'assistant',
        parts: [],
      };
      const callback = vi.fn();
      const unsubscribe = store.subscribe({
        onChatMessagesChanged: callback,
      });

      store.updateLastMessage(msg);
      expect(store.getMessages()).toEqual([
        { id: '1', content: 'hello', role: 'user', parts: [] },
        msg,
      ]);
      expect(callback).toHaveBeenCalledOnce();

      unsubscribe();
      store.updateLastMessage(msg);
      expect(callback).toHaveBeenCalledOnce();
    });

    it('throws an error if the chat is empty', () => {
      const { store } = initChat();
      expect(() =>
        store.updateLastMessage({
          id: '1',
          content: 'hello',
          role: 'user',
          parts: [],
        }),
      ).toThrow();
    });
  });

  describe('removeLastMessage', () => {
    it('notifies subscribers', () => {
      const { store } = initChat([
        { id: '1', content: 'hello', role: 'user', parts: [] },
        { id: '2', content: 'world', role: 'assistant', parts: [] },
      ]);
      const callback = vi.fn();
      const unsubscribe = store.subscribe({
        onChatMessagesChanged: callback,
      });

      store.removeLastMessage();
      expect(store.getMessages()).toEqual([
        { id: '1', content: 'hello', role: 'user', parts: [] },
      ]);
      expect(callback).toHaveBeenCalledOnce();

      unsubscribe();
      store.removeLastMessage();
      expect(callback).toHaveBeenCalledOnce();
    });

    it('removes the last message only if given role matches', () => {
      const { store } = initChat([
        { id: '1', content: 'hello', role: 'user', parts: [] },
        { id: '2', content: 'world', role: 'assistant', parts: [] },
      ]);

      store.removeLastMessage('assistant');
      expect(store.getMessages()).toEqual([
        { id: '1', content: 'hello', role: 'user', parts: [] },
      ]);
    });

    it('does not remove the last message if the role does not match', () => {
      const { store } = initChat([
        { id: '1', content: 'hello', role: 'user', parts: [] },
        { id: '2', content: 'world', role: 'assistant', parts: [] },
      ]);

      store.removeLastMessage('user');
      expect(store.getMessages()).toEqual([
        { id: '1', content: 'hello', role: 'user', parts: [] },
        { id: '2', content: 'world', role: 'assistant', parts: [] },
      ]);
    });
  });

  describe('clear', () => {
    it('notifies subscribers', () => {
      const { store } = initChat([
        { id: '1', content: 'hello', role: 'user', parts: [] },
        { id: '2', content: 'world', role: 'assistant', parts: [] },
      ]);
      const callback = vi.fn();
      const unsubscribe = store.subscribe({
        onChatMessagesChanged: callback,
      });

      store.clear();
      expect(store.getMessages()).toEqual([]);
      expect(callback).toHaveBeenCalledOnce();

      unsubscribe();
      store.clear();
      expect(callback).toHaveBeenCalledOnce();
    });
  });

  describe('addOrUpdateAssistantMessageParts', () => {
    it('notifies subscribers', () => {
      const { store } = initChat([
        { id: '1', content: 'hello', role: 'user', parts: [] },
        { id: '2', content: 'hi', role: 'assistant', parts: [] },
      ]);
      const callback = vi.fn();
      const unsubscribe = store.subscribe({
        onChatMessagesChanged: callback,
      });

      store.addOrUpdateAssistantMessageParts({
        partDelta: { type: 'text', text: ' im a robot' },
        step: 1,
      });
      expect(store.getMessages()).toEqual([
        { id: '1', content: 'hello', role: 'user', parts: [] },
        {
          id: '2',
          content: 'hi im a robot',
          role: 'assistant',
          parts: [{ type: 'text', text: ' im a robot' }],
        },
      ]);
      expect(callback).toHaveBeenCalledOnce();

      unsubscribe();
      store.addOrUpdateAssistantMessageParts({
        partDelta: { type: 'text', text: 'hi' },
        step: 1,
      });
      expect(callback).toHaveBeenCalledOnce();
    });

    it('should do nothing if chat is empty', () => {
      const { store } = initChat();
      store.addOrUpdateAssistantMessageParts({
        partDelta: { type: 'text', text: 'hi' },
        step: 1,
      });
      expect(store.getMessages()).toEqual([]);
    });

    it('should create a new assistant message if last message was from user', () => {
      const { store } = initChat([
        { id: '1', content: 'hello', role: 'user', parts: [] },
      ]);
      store.addOrUpdateAssistantMessageParts({
        partDelta: { type: 'text', text: 'hi' },
        step: 1,
      });
      const messages = store.getMessages();
      expect(messages).toHaveLength(2);
      expect(messages[1]).toMatchObject({
        id: expect.any(String),
        role: 'assistant',
        content: 'hi',
        parts: [{ type: 'text', text: 'hi' }],
      });
    });

    it('should use generated ID for new assistant message when no ID provided', () => {
      const mockGenerateId = vi.fn().mockReturnValue('generated-id');
      const { store } = initChat([
        { id: '1', content: 'hello', role: 'user', parts: [] },
      ]);

      store.addOrUpdateAssistantMessageParts({
        partDelta: { type: 'text', text: 'hi' },
        step: 1,
        generateId: mockGenerateId,
      });

      expect(mockGenerateId).toHaveBeenCalledOnce();
      expect(store.getMessages()[1].id).toBe('generated-id');
    });

    it('should handle multiple text parts', () => {
      const { store } = initChat([
        { id: '1', content: 'hello', role: 'user', parts: [] },
      ]);
      store.addOrUpdateAssistantMessageParts({
        partDelta: { type: 'text', text: 'Hello' },
        step: 1,
      });
      store.addOrUpdateAssistantMessageParts({
        partDelta: { type: 'text', text: ' ' },
        step: 1,
      });
      store.addOrUpdateAssistantMessageParts({
        partDelta: { type: 'text', text: 'world' },
        step: 1,
      });
      const message = store.getMessages()[1];
      expect(message.content).toBe('Hello world');
      expect(message.parts).toHaveLength(1);
      expect(message.parts).toEqual([{ type: 'text', text: 'Hello world' }]);
    });

    it('should handle step-start parts', () => {
      const { store } = initChat([
        { id: '1', content: 'hello', role: 'user', parts: [] },
        { id: '2', content: '', role: 'assistant', parts: [] },
      ]);

      const stepStart = { type: 'step-start' as const, step: 1 };
      store.addOrUpdateAssistantMessageParts({
        partDelta: stepStart,
        step: 1,
      });

      expect(store.getMessages()[1].parts).toContainEqual(stepStart);
    });

    it('should handle source parts', () => {
      const { store } = initChat([
        { id: '1', content: '', role: 'user', parts: [] },
        { id: '2', content: '', role: 'assistant', parts: [] },
      ]);
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
        partDelta: source,
        step: 1,
      });
      expect(store.getMessages()[1].parts).toContainEqual(source);
    });

    it('should handle file parts', () => {
      const { store } = initChat([
        { id: '1', content: '', role: 'user', parts: [] },
        { id: '2', content: '', role: 'assistant', parts: [] },
      ]);
      const file = {
        type: 'file' as const,
        mediaType: 'text/plain',
        data: 'hello',
      };
      store.addOrUpdateAssistantMessageParts({
        partDelta: file,
        step: 1,
      });
      expect(store.getMessages()[1].parts).toContainEqual(file);
    });

    it('should handle tool-invocation parts', () => {
      const { store } = initChat([
        { id: '1', content: '', role: 'user', parts: [] },
        { id: '2', content: '', role: 'assistant', parts: [] },
      ]);

      const toolInvocation = {
        type: 'tool-invocation' as const,
        toolInvocation: {
          toolCallId: 'test-id',
          toolName: 'test-tool',
          args: '{"arg": "value"}',
          state: 'call' as const,
          step: 1,
        },
      };

      store.addOrUpdateAssistantMessageParts({
        partDelta: toolInvocation,
        step: 1,
      });

      expect(store.getMessages()[1].parts).toContainEqual(toolInvocation);
    });

    it('should handle reasoning parts', () => {
      const { store } = initChat([
        { id: '1', content: '', role: 'user', parts: [] },
        { id: '2', content: '', role: 'assistant', parts: [] },
      ]);

      const reasoning = {
        type: 'reasoning' as const,
        reasoning: 'test reasoning',
        details: [{ type: 'text' as const, text: 'test reasoning' }],
      };

      store.addOrUpdateAssistantMessageParts({
        partDelta: reasoning,
        step: 1,
      });

      expect(store.getMessages()[1].parts).toContainEqual(reasoning);
    });

    it('should throw error for invalid part type', () => {
      const { store } = initChat([
        { id: '1', content: '', role: 'assistant', parts: [] },
      ]);

      expect(() =>
        store.addOrUpdateAssistantMessageParts({
          partDelta: { type: 'invalid' as any },
          step: 1,
        }),
      ).toThrow('Invalid part delta type');
    });
  });

  describe('tool invocation handling', () => {
    it('should initialize deprecated toolInvocations array if not present', () => {
      const { store } = initChat([
        { id: '1', content: '', role: 'user', parts: [] },
        { id: '2', content: '', role: 'assistant', parts: [] },
      ]);

      const toolInvocation = {
        type: 'tool-invocation' as const,
        toolInvocation: {
          toolCallId: 'test-id',
          toolName: 'test-tool',
          args: '{"arg": "value"}',
          state: 'partial-call' as const,
          step: 1,
        },
      };

      store.addOrUpdateAssistantMessageParts({
        partDelta: toolInvocation,
        step: 1,
      });

      const messages = store.getMessages();
      expect(messages[1].toolInvocations).toEqual([
        {
          toolCallId: 'test-id',
          toolName: 'test-tool',
          args: '{"arg": "value"}',
          state: 'partial-call',
          step: 1,
        },
      ]);
      expect(messages[1].parts).toContainEqual(toolInvocation);
    });

    it('should throw error if result comes before call', () => {
      const { store } = initChat([
        { id: '1', content: '', role: 'user', parts: [] },
        { id: '2', content: '', role: 'assistant', parts: [] },
      ]);

      expect(() =>
        store.addOrUpdateAssistantMessageParts({
          partDelta: {
            type: 'tool-invocation',
            toolInvocation: {
              toolCallId: 'test-id',
              toolName: 'test-tool',
              state: 'result' as const,
              args: undefined,
              step: 1,
              result: 'some result',
            },
          },
          step: 1,
        }),
      ).toThrow('tool_result must be preceded by a tool_call');
    });

    it('should accumulate partial-call args', () => {
      const { store } = initChat([
        { id: '1', content: '', role: 'user', parts: [] },
        { id: '2', content: '', role: 'assistant', parts: [] },
      ]);

      store.addOrUpdateAssistantMessageParts({
        partDelta: {
          type: 'tool-invocation',
          toolInvocation: {
            toolCallId: 'test-id',
            toolName: 'test-tool',
            args: '{"arg": "val',
            state: 'partial-call',
            step: 1,
          },
        },
        step: 1,
      });

      store.addOrUpdateAssistantMessageParts({
        partDelta: {
          type: 'tool-invocation',
          toolInvocation: {
            toolCallId: 'test-id',
            toolName: 'test-tool',
            args: 'ue"}',
            state: 'partial-call',
            step: 1,
          },
        },
        step: 1,
      });

      const message = store.getMessages()[1];
      expect(message.toolInvocations?.[0]).toMatchObject({
        toolCallId: 'test-id',
        toolName: 'test-tool',
        args: { arg: 'value' },
        state: 'partial-call',
      });
      expect(message.parts[0]).toMatchObject({
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
      const { store } = initChat([
        { id: '1', content: '', role: 'user', parts: [] },
        { id: '2', content: '', role: 'assistant', parts: [] },
      ]);

      store.addOrUpdateAssistantMessageParts({
        partDelta: {
          type: 'tool-invocation',
          toolInvocation: {
            toolCallId: 'test-id',
            toolName: 'test-tool',
            args: { arg: 'value' },
            state: 'call' as const,
            step: 1,
          },
        },
        step: 1,
      });

      store.addOrUpdateAssistantMessageParts({
        partDelta: {
          type: 'tool-invocation',
          toolInvocation: {
            toolCallId: 'test-id',
            toolName: 'test-tool',
            args: undefined,
            state: 'result' as const,
            step: 1,
            result: 'success',
          },
        },
        step: 1,
      });

      const message = store.getMessages()[1];
      expect(message.toolInvocations?.[0]).toMatchObject({
        toolCallId: 'test-id',
        toolName: 'test-tool',
        args: { arg: 'value' },
        state: 'result',
        result: 'success',
      });
      expect(message.parts[0]).toMatchObject({
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
      const { store } = initChat([
        { id: '1', content: '', role: 'assistant', parts: [] },
      ]);

      expect(() =>
        store.addOrUpdateAssistantMessageParts({
          partDelta: {
            type: 'tool-invocation',
            toolInvocation: {
              toolCallId: 'test-id',
              toolName: 'test-tool',
              state: 'invalid' as any,
              step: 1,
              args: undefined,
              result: undefined,
            },
          },
          step: 1,
        }),
      ).toThrow('Invalid tool invocation state');
    });

    it('should handle multiple tool invocations', () => {
      const { store } = initChat([
        { id: '1', content: '', role: 'user', parts: [] },
        { id: '2', content: '', role: 'assistant', parts: [] },
      ]);

      store.addOrUpdateAssistantMessageParts({
        partDelta: {
          type: 'tool-invocation',
          toolInvocation: {
            toolCallId: 'tool1',
            toolName: 'test-tool',
            args: { arg: 'value1' },
            state: 'call' as const,
            step: 1,
          },
        },
        step: 1,
      });

      store.addOrUpdateAssistantMessageParts({
        partDelta: {
          type: 'tool-invocation',
          toolInvocation: {
            toolCallId: 'tool2',
            toolName: 'test-tool',
            args: { arg: 'value2' },
            state: 'call' as const,
            step: 2,
          },
        },
        step: 2,
      });

      const message = store.getMessages()[1];
      expect(message.toolInvocations).toHaveLength(2);
      expect(
        message.parts.filter(p => p.type === 'tool-invocation'),
      ).toHaveLength(2);
    });
  });

  describe('reasoning handling', () => {
    it('should initialize reasoning with text detail', () => {
      const { store } = initChat([
        { id: '1', content: '', role: 'user', parts: [] },
        { id: '2', content: '', role: 'assistant', parts: [] },
      ]);

      store.addOrUpdateAssistantMessageParts({
        partDelta: {
          type: 'reasoning',
          reasoning: 'initial thought',
          details: [],
        },
        step: 1,
      });

      const message = store.getMessages()[1];
      expect(message.parts[0]).toMatchObject({
        type: 'reasoning',
        reasoning: 'initial thought',
        details: [{ type: 'text', text: 'initial thought' }],
      });
      expect(message.reasoning).toBe('initial thought');
    });

    it('should initialize reasoning with signature', () => {
      const { store } = initChat([
        { id: '1', content: '', role: 'user', parts: [] },
        { id: '1', content: '', role: 'assistant', parts: [] },
      ]);

      store.addOrUpdateAssistantMessageParts({
        partDelta: {
          type: 'reasoning',
          reasoning: '',
          details: [
            {
              type: 'text',
              text: '',
              signature: 'test-signature',
            },
          ],
        },
        step: 1,
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
      const { store } = initChat([
        { id: '1', content: '', role: 'user', parts: [] },
        { id: '2', content: '', role: 'assistant', parts: [] },
      ]);

      store.addOrUpdateAssistantMessageParts({
        partDelta: {
          type: 'reasoning',
          reasoning: '',
          details: [
            {
              type: 'redacted',
              data: 'redacted data',
            },
          ],
        },
        step: 1,
      });

      const message = store.getMessages()[1];
      expect(message.parts[0]).toMatchObject({
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
      const { store } = initChat([
        { id: '1', content: '', role: 'user', parts: [] },
        { id: '2', content: '', role: 'assistant', parts: [] },
      ]);

      store.addOrUpdateAssistantMessageParts({
        partDelta: {
          type: 'reasoning',
          reasoning: 'First thought. ',
          details: [],
        },
        step: 1,
      });

      store.addOrUpdateAssistantMessageParts({
        partDelta: {
          type: 'reasoning',
          reasoning: 'Second thought.',
          details: [],
        },
        step: 1,
      });

      const message = store.getMessages()[1];
      expect(message.parts[0]).toMatchObject({
        type: 'reasoning',
        reasoning: 'First thought. Second thought.',
        details: [{ type: 'text', text: 'First thought. Second thought.' }],
      });
      expect(message.reasoning).toBe('First thought. Second thought.');
    });

    it('should update signature when provided in subsequent parts', () => {
      const { store } = initChat([
        { id: '1', content: '', role: 'user', parts: [] },
        { id: '2', content: '', role: 'assistant', parts: [] },
      ]);

      store.addOrUpdateAssistantMessageParts({
        partDelta: {
          type: 'reasoning',
          reasoning: 'Initial thought',
          details: [],
        },
        step: 1,
      });

      store.addOrUpdateAssistantMessageParts({
        partDelta: {
          type: 'reasoning',
          reasoning: '',
          details: [
            {
              type: 'text',
              text: '',
              signature: 'late-signature',
            },
          ],
        },
        step: 1,
      });

      const message = store.getMessages()[1];
      expect(message.parts[0]).toMatchObject({
        type: 'reasoning',
        reasoning: 'Initial thought',
        details: [
          {
            type: 'text',
            text: 'Initial thought',
            signature: 'late-signature',
          },
        ],
      });
    });

    it('should update reasoning with redacted detail', () => {
      const { store } = initChat([
        { id: '1', content: '', role: 'user', parts: [] },
        { id: '2', content: '', role: 'assistant', parts: [] },
      ]);

      store.addOrUpdateAssistantMessageParts({
        partDelta: {
          type: 'reasoning',
          reasoning: 'Initial text.',
          details: [],
        },
        step: 1,
      });

      store.addOrUpdateAssistantMessageParts({
        partDelta: {
          type: 'reasoning',
          reasoning: '',
          details: [
            {
              type: 'redacted',
              data: 'redacted data',
            },
          ],
        },
        step: 1,
      });

      store.addOrUpdateAssistantMessageParts({
        partDelta: {
          type: 'reasoning',
          reasoning: ' Another thought.',
          details: [],
        },
        step: 1,
      });

      const message = store.getMessages()[1];
      expect(message.parts[0]).toMatchObject({
        type: 'reasoning',
        reasoning: 'Initial text. Another thought.',
        details: [
          { type: 'text', text: 'Initial text.' },
          { type: 'redacted', data: 'redacted data' },
          { type: 'text', text: ' Another thought.' },
        ],
      });
    });
  });
});
