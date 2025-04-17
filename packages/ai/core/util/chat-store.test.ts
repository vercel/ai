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

      store.updateLastMessage(msg);
      expect(store.getMessages()).toEqual([msg]);
      expect(callback).toHaveBeenCalledOnce();

      unsubscribe();
      store.updateLastMessage(msg);
      expect(callback).toHaveBeenCalledOnce();
    });
  });

  describe('removeLastMessage', () => {
    it('notifies subscribers', () => {});
    it('removes the last message for a given role', () => {});
  });

  describe('clear');

  describe('addOrUpdateAssistantMessageParts');

  describe('addOrUpdateToolInvocation');

  describe('addOrUpdateReasoning');
});
