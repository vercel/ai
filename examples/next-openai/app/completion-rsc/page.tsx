'use client';

import { readStreamableValue } from 'ai/rsc';
import { useState } from 'react';
import { generateCompletion } from './generate-completion';
import { unstable_noStore as noStore } from 'next/cache';

// Force the page to be dynamic and allow streaming responses up to 30 seconds
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export default function Chat() {
  noStore();
  const [input, setInput] = useState('');
  const [completion, setCompletion] = useState('');

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setInput(event.target.value);
  };

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      <h4 className="pb-4 text-xl font-bold text-gray-900 md:text-xl">
        RSC Completion Example
      </h4>

      {completion}
      <form
        onSubmit={async e => {
          e.preventDefault();

          const streamableCompletion = await generateCompletion(input);
          for await (const text of readStreamableValue(streamableCompletion)) {
            setCompletion(text ?? '');
          }
        }}
      >
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
