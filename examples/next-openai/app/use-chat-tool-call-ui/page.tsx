'use client';

import { useChat } from 'ai/react';

export default function Chat() {
  const { messages, input, handleInputChange, handleSubmit, data } = useChat({
    api: '/api/use-chat-tool-call-ui',
  });

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      {data?.map((d: any, i) => (
        <div key={i} className="whitespace-pre-wrap">
          {d.city ? `Weather in ${d.city}: ${d.weather}` : ''}
        </div>
      ))}

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
