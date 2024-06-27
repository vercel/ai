'use client';

import { Message, useChat } from 'ai/react';

export default function Chat() {
  const { messages, input, handleInputChange, handleSubmit, data } = useChat({
    api: '/api/use-chat-streamdata',
  });

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      {data && (
        <pre className="p-4 text-sm bg-gray-100">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}

      {messages?.map((m: Message) => (
        <div key={m.id} className="whitespace-pre-wrap">
          <strong>{`${m.role}: `}</strong>
          {m.content}
          <br />
          <br />
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
