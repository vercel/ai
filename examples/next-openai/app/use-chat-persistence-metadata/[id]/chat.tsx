'use client';

import { zodSchema } from '@ai-sdk/provider-utils';
import { UIMessage, useChat } from '@ai-sdk/react';
import { defaultChatStore } from 'ai';
import { z } from 'zod';

export default function Chat({
  id,
  initialMessages,
}: {
  id?: string | undefined;
  initialMessages?: UIMessage<{ createdAt: string }>[];
} = {}) {
  const { input, status, handleInputChange, handleSubmit, messages } = useChat({
    chatStore: defaultChatStore({
      api: '/api/use-chat-persistence-metadata',
      messageMetadataSchema: zodSchema(
        z.object({
          createdAt: z.string().datetime(),
        }),
      ),
      chats:
        initialMessages && id
          ? { [id]: { messages: initialMessages } }
          : undefined,
    }),
    id, // use the provided chatId
  });

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      {messages.map(m => (
        <div key={m.id} className="whitespace-pre-wrap">
          {m.role === 'user' ? 'User: ' : 'AI: '}
          {m.metadata?.createdAt && (
            <div>
              Created at: {new Date(m.metadata.createdAt).toLocaleString()}
            </div>
          )}
          {m.parts.map((part, index) => {
            if (part.type === 'text') {
              return <div key={index}>{part.text}</div>;
            }
          })}
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
