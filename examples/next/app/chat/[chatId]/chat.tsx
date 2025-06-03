'use client';

import { UIMessage, useChat } from '@ai-sdk/react';
import { defaultChatStoreOptions } from 'ai';

export default function Chat({
  chatId,
  initialMessages,
}: { chatId?: string | undefined; initialMessages?: UIMessage[] } = {}) {
  const { input, status, handleInputChange, handleSubmit, messages } = useChat({
    chatId,
    chatStore: defaultChatStoreOptions({
      chats: chatId
        ? { [chatId]: { messages: initialMessages ?? [] } }
        : undefined,

      // only send the last message to the server:
      prepareRequestBody({ chatId, messages }) {
        return { chatId, message: messages[messages.length - 1] };
      },
    }),
  });

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
