import { ChatInit } from 'ai';
import { Chat } from './chat.react';
import { UIMessage } from './use-chat';

const registry = new Map<string, Chat<any>>();

// ?: Better memory management with FinalizationRegistry + WeakRef

export function getOrCreateChat<UI_MESSAGE extends UIMessage>(
  opts: { chat: Chat<UI_MESSAGE> } | ChatInit<UI_MESSAGE>,
) {
  if ('chat' in opts) {
    registry.set(opts.chat.id, opts.chat);
    return opts.chat;
  }

  const chatId = opts.id;
  if (chatId && registry.has(chatId)) return registry.get(chatId)!;

  const newChat = new Chat(opts);
  registry.set(newChat.id, newChat);
  return newChat;
}
