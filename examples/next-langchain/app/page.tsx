'use client';

import { useChat } from '@ai-sdk/react';
import Link from 'next/link';
import { useState } from 'react';

export default function Chat() {
  const [input, setInput] = useState('');
  const { messages, sendMessage, status, error } = useChat();

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      <h4 className="pb-2 text-xl font-bold text-gray-900">
        AI SDK + LangChain Examples
      </h4>

      <nav className="pb-6 mb-6 border-b border-gray-200">
        <ul className="flex flex-col gap-2 text-sm">
          <li>
            <Link href="/" className="text-blue-600 hover:underline font-medium">
              Chat (current)
            </Link>
          </li>
          <li>
            <Link href="/langgraph" className="text-blue-600 hover:underline">
              LangGraph Example
            </Link>
            <span className="text-gray-400 ml-2">
              — uses toBaseMessage & toUIMessageStream
            </span>
          </li>
          <li>
            <Link href="/createAgent" className="text-blue-600 hover:underline">
              LangChain Agent Example
            </Link>
            <span className="text-gray-400 ml-2">
              — uses createAgent with toUIMessageStream
            </span>
          </li>
          <li>
            <Link href="/langsmith" className="text-blue-600 hover:underline">
              LangSmith Deployment
            </Link>
            <span className="text-gray-400 ml-2">
              — uses LangSmithDeploymentTransport
            </span>
          </li>
        </ul>
      </nav>

      {error && (
        <div className="p-4 mb-4 text-white bg-red-500 rounded">
          {error.message}
        </div>
      )}

      {messages.length > 0
        ? messages.map(m => (
            <div key={m.id} className="whitespace-pre-wrap mb-4">
              <span className="font-bold">
                {m.role === 'user' ? 'User: ' : 'AI: '}
              </span>
              {m.parts
                .map(part => (part.type === 'text' ? part.text : ''))
                .join('')}
            </div>
          ))
        : null}

      {status === 'streaming' && (
        <div className="text-gray-400 italic">AI is thinking...</div>
      )}

      <form
        onSubmit={e => {
          e.preventDefault();
          if (input.trim()) {
            sendMessage({ text: input });
            setInput('');
          }
        }}
      >
        <input
          className="fixed bottom-0 w-full max-w-md p-2 mb-8 border border-gray-300 rounded shadow-xl"
          value={input}
          placeholder="Say something..."
          onChange={e => setInput(e.target.value)}
          disabled={status === 'streaming'}
        />
      </form>
    </div>
  );
}
