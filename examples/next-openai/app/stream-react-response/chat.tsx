'use client';

import { useChat } from 'ai/react';

export function Chat({ handler }: { handler: any }) {
  const { messages, input, handleInputChange, handleSubmit } = useChat({
    api: handler,
  });

  return (
    <div className="container mx-auto p-4">
      <ul>
        {messages.map((m, index) => (
          <li key={index}>
            {m.role === 'user' ? 'User: ' : 'AI: '}
            {m.role === 'user' ? m.content : m.ui}
          </li>
        ))}
      </ul>

      <form
        className="flex gap-2 fixed bottom-0 left-0 w-full p-4 border-t"
        onSubmit={handleSubmit}
      >
        <input
          className="border border-gray-500 rounded p-2 w-full"
          placeholder="what is Next.js..."
          value={input}
          onChange={handleInputChange}
          autoFocus
        />
        <button type="submit" className="bg-black text-white rounded px-4">
          Send
        </button>
      </form>
    </div>
  );
}
