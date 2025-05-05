'use client';

import { useChat } from '@ai-sdk/react';
import { getUIText } from 'ai';
import { toast } from 'sonner';

export default function Chat() {
  const { messages, input, handleInputChange, handleSubmit } = useChat({
    onError: err => {
      toast.error(err.message);
    },
  });

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      {messages.length > 0
        ? messages.map(m => (
            <div key={m.id} className="whitespace-pre-wrap">
              {m.role === 'user' ? 'User: ' : 'AI: '}
              {getUIText(m.parts)}
            </div>
          ))
        : null}

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
