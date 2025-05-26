'use client';

import { Card } from '@/app/components';
import { useChat, ChatStore } from '@ai-sdk/react';
import { TextStreamChatTransport } from 'ai';

export default function Page() {
  const { messages, input, handleSubmit, handleInputChange, status } = useChat({
    chatStore: new ChatStore({
      transport: new TextStreamChatTransport({
        api: '/api/chat?protocol=text',
      }),
    }),
  });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 p-4">
        {messages.map(message => (
          <div key={message.id} className="flex flex-row gap-2">
            <div className="flex-shrink-0 w-24 text-zinc-500">{`${message.role}: `}</div>
            <div className="flex flex-col gap-2">
              {message.parts
                .map(part => (part.type === 'text' ? part.text : ''))
                .join('')}
            </div>
          </div>
        ))}
      </div>

      {messages.length === 0 && <Card type="chat-text" />}

      <form
        onSubmit={handleSubmit}
        className="fixed bottom-0 flex flex-col w-full border-t"
      >
        <input
          value={input}
          placeholder="Why is the sky blue?"
          onChange={handleInputChange}
          className="w-full p-4 bg-transparent outline-none"
          disabled={status !== 'ready'}
        />
      </form>
    </div>
  );
}
