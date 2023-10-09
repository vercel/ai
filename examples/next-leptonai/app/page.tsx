'use client';

import { useChat } from 'ai/react';

export default function Chat() {
  const { messages, input, handleInputChange, handleSubmit, data } = useChat();
  return (
    <div className="flex flex-col w-full stretch">
      {
        messages.length === 0 && (
          <div className="p-4 max-w-md mx-auto pt-8">
            <h1 className="text-xl font-bold">Welcome to use Lepton AI API</h1>
            <p className="text-gray-500 text-sm pt-4">
              This example shows how to use the <a className="underline" href="https://sdk.vercel.ai/docs">Vercel AI SDK</a> with <a className="underline" href="https://nextjs.org/">Next.js</a> and <a className="underline" href="https://www.lepton.ai/">Lepton AI</a> to create a ChatGPT-like AI-powered streaming chat bot.
            </p>
          </div>
        )
      }
      <div className="divide-y divide-slate-200">
        {messages.length > 0
          ? messages.map(m => (
            <div key={m.id} className="even:bg-zinc-100">
              <div className="p-4 max-w-md mx-auto">
                <div className="flex flex-row items-start w-full">
              <span className="mr-2 flex-shrink-0">
                {m.role === 'user' ? '👤' : '🤖'}
              </span>
                  <div className="whitespace-pre-wrap">
                    {m.content}
                  </div>
                </div>
              </div>
            </div>
          ))
          : null}
      </div>
    
      <form onSubmit={handleSubmit}>
        <input
          className="fixed bottom-0 w-full max-w-md left-1/2 transform -translate-x-1/2 p-2 mb-8 border border-gray-300 rounded shadow-xl"
          value={input}
          placeholder="Say something..."
          onChange={handleInputChange}
        />
      </form>
    </div>
  );
}
