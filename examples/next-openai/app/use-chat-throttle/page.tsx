'use client';

import { useChat } from '@ai-sdk/react';
import { useLayoutEffect, useRef } from 'react';

export default function Chat() {
  const renderCount = useRef(0);
  useLayoutEffect(() => {
    console.log(`component rendered #${++renderCount.current}`);
  });

  const { messages, input, isLoading, error, handleInputChange, handleSubmit } =
    useChat({
      api: '/api/use-chat-throttle',
      experimental_throttle: 50,
    });

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      <h4 className="pb-4 text-xl font-bold text-gray-900 md:text-xl">
        useChat throttle example
      </h4>
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
          disabled={isLoading || error != null}
        />
      </form>
    </div>
  );
}
