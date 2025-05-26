'use client';

import { UIMessage, useChat } from '@ai-sdk/react';
import { defaultChatStoreOptions } from 'ai';
import { createIdGenerator } from 'ai';

export default function Chat({
  chatId,
  initialMessages,
}: { chatId?: string | undefined; initialMessages?: UIMessage[] } = {}) {
  const { input, status, handleInputChange, handleSubmit, messages, stop } =
    useChat({
      chatStore: defaultChatStoreOptions({
        api: '/api/use-chat-resilient-persistence',
        chats:
          initialMessages && chatId
            ? { [chatId]: { messages: initialMessages } }
            : undefined,
      }),
      chatId, // use the provided chatId
      generateId: createIdGenerator({ prefix: 'msgc', size: 16 }), // id format for client-side messages
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
        {status === 'streaming' && (
          <button
            className="fixed bottom-0 w-full max-w-md p-2 mb-8 border border-gray-300 rounded shadow-xl"
            type="submit"
            onClick={stop}
          >
            Stop
          </button>
        )}
      </form>
    </div>
  );
}
