'use client';

import { Card } from '@/app/components';
import { useChat } from 'ai/react';

export default function Page() {
  const { messages, input, handleSubmit, handleInputChange, isLoading } =
    useChat({
      api: '/api/chat?protocol=text',
      streamProtocol: 'text',
    });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col p-4 gap-2">
        {messages.map(message => (
          <div key={message.id} className="flex flex-row gap-2">
            <div className="w-24 text-zinc-500 flex-shrink-0">{`${message.role}: `}</div>
            <div className="flex flex-col gap-2">{message.content}</div>
          </div>
        ))}
      </div>

      {messages.length === 0 && <Card type="chat-text" />}

      <form
        onSubmit={handleSubmit}
        className="flex flex-col fixed bottom-0 w-full border-t"
      >
        <input
          value={input}
          placeholder="Why is the sky blue?"
          onChange={handleInputChange}
          className="w-full p-4 outline-none bg-transparent"
          disabled={isLoading}
        />
      </form>
    </div>
  );
}
