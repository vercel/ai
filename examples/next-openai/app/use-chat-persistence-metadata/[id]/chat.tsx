'use client';

import { UIMessage, useChat } from '@ai-sdk/react';

export default function Chat({
  id,
  initialMessages,
}: { id?: string | undefined; initialMessages?: UIMessage[] } = {}) {
  const { input, status, handleInputChange, handleSubmit, messages } = useChat({
    api: '/api/use-chat-persistence-metadata',
    id, // use the provided chatId
    initialMessages, // initial messages if provided
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
