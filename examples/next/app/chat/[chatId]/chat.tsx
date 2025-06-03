'use client';

import { Chat2, createChatStore, useChat2 } from '@ai-sdk/react';
import { ChatModel } from '@util/chat-store';
import { defaultChatStoreOptions } from 'ai';

function createChat(chat: ChatModel): Chat2 {
  const store = createChatStore({
    ...defaultChatStoreOptions({
      // only send the last message to the server:
      prepareRequestBody: ({ chatId, messages }) => ({
        chatId,
        message: messages[messages.length - 1],
      }),
    })(),
    chats: {
      [chat.chatId]: {
        messages: chat.messages ?? [],
      },
    },
  });

  return {
    id: chat.chatId,
    status: store.getStatus(chat.chatId),
    get messages() {
      return store.getMessages(chat.chatId);
    },
    subscribe: options => store.subscribe(options),
    addToolResult: options =>
      store.addToolResult({ chatId: chat.chatId, ...options }),
    stopStream: () => store.stopStream({ chatId: chat.chatId }),
    submitMessage: options =>
      store.submitMessage({ chatId: chat.chatId, ...options }),
    resubmitLastUserMessage: async options => {
      await store.resubmitLastUserMessage({
        chatId: chat.chatId,
        ...options,
      });
    },
    resumeStream: async options => {
      await store.resumeStream({ chatId: chat.chatId, ...options });
    },
    setMessages: async ({ messages }) => {
      store.setMessages({ id: chat.chatId, messages });
    },
  };
}

export default function Chat({ chat }: { chat: ChatModel }) {
  const { input, status, handleInputChange, handleSubmit, messages } = useChat2(
    { chat: createChat(chat) },
  );

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      {messages.map(m => (
        <div key={m.id} className="whitespace-pre-wrap">
          {m.role === 'user' ? 'User: ' : 'AI: '}
          {m.parts
            .map(part => (part.type === 'text' ? part.text : ''))
            .join('')}
        </div>
      ))}

      <form onSubmit={handleSubmit}>
        <input
          className="fixed bottom-0 w-full max-w-md p-2 mb-8 border border-gray-300 rounded shadow-xl"
          value={input}
          placeholder="Say something..."
          onChange={handleInputChange}
          disabled={status !== 'ready'}
        />
      </form>
    </div>
  );
}
