'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useState, useMemo } from 'react';

export default function LangGraphChat() {
  const [input, setInput] = useState('');

  // Create a transport for the LangGraph API endpoint
  const transport = useMemo(
    () => new DefaultChatTransport({ api: '/api/langgraph' }),
    [],
  );

  const { messages, sendMessage, status, error } = useChat({
    transport,
  });

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      <h4 className="pb-4 text-xl font-bold text-gray-900 md:text-xl">
        LangGraph Example
      </h4>
      <p className="pb-4 text-sm text-gray-500">
        This example uses the new <code>toBaseMessage</code> and{' '}
        <code>toUIMessageStream</code> primitives to integrate LangGraph with
        the AI SDK.
      </p>

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
