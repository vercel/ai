'use client';
import * as uuid from 'uuid';
import { useChat } from 'ai/react';
import { useEffect, useMemo } from 'react';
import { getQueryParam } from '@/app/utils';

export default function Chat() {
  useEffect(() => {
    if (!getQueryParam("sessionId")) {
      window.location.search = `sessionId=${uuid.v4()}`;
    }
  }, []);

  const { messages, input, handleInputChange, handleSubmit } = useChat({
    body: {
      sessionId: getQueryParam("sessionId"),
    },
    api: "/api/chat"
  });

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      {messages.map(m => (
        <div key={m.id} className="whitespace-pre-wrap">
          {m.role === 'user' ? 'User: ' : 'AI: '}
          {m.content}
        </div>
      ))}

      <form onSubmit={handleSubmit}>
        <input
          className="fixed bottom-0 w-full max-w-md p-2 mb-8 border border-gray-300 rounded shadow-xl"
          value={input}
          placeholder="Say something..."
          onChange={handleInputChange}
        />
      </form>
    </div>
  );
}
