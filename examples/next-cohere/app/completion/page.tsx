'use client';

import { useCompletion } from '@ai-sdk/react';
import { FormEventHandler, useState } from 'react';

export default function Chat() {
  const {
    completion,
    input,
    setInput,
    handleInputChange,
    handleSubmit,
    error,
  } = useCompletion();

  const [prompt, setPrompt] = useState('');

  const handleSend: FormEventHandler<HTMLFormElement> = async e => {
    handleSubmit(e);
    setPrompt(input);
    setInput('');
  };

  return (
    <div className="p-4">
      <header className="text-center">
        <h1 className="text-xl">Completion Example</h1>
      </header>
      <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
        {error && (
          <div className="fixed top-0 left-0 w-full p-4 text-center bg-red-500 text-white">
            {error.message}
          </div>
        )}
        {completion && (
          <ol className="space-y-2">
            <li>
              <span className="font-medium">Prompt: </span>
              {prompt}
            </li>
            <li>
              <span className="font-medium">Cohere: </span>
              {completion}
            </li>
          </ol>
        )}
        <form onSubmit={handleSend}>
          <input
            className="fixed bottom-0 w-full max-w-md p-2 mb-8 border border-gray-300 rounded shadow-xl"
            value={input}
            placeholder="Ask something..."
            onChange={handleInputChange}
          />
        </form>
      </div>
    </div>
  );
}
