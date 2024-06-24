'use client';

import { useChat } from 'ai/react';

export default function Chat() {
  const { messages, input, handleInputChange, handleSubmit, data } = useChat();
  console.log({ messages });

  return (
    <div className="p-4">
      <header className="text-center">
        <h1 className="text-xl">Chat Example</h1>
      </header>
      <div className="flex flex-col justify-between w-full max-w-md mx-auto stretch">
        <div className="flex-grow overflow-y-auto">
          {messages.map(m => (
            <div key={m.id} className="whitespace-pre-wrap">
              {m.role === 'user' ? 'User: ' : 'AI: '}
              {m.content}
            </div>
          ))}
        </div>
        <form onSubmit={handleSubmit}>
          <input
            className="fixed bottom-0 w-full max-w-md p-2 mb-8 border border-gray-300 rounded shadow-xl"
            value={input}
            placeholder="Say something..."
            onChange={handleInputChange}
          />
        </form>
      </div>
    </div>
  );
}
