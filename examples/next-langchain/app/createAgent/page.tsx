'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useState } from 'react';

const transport = new DefaultChatTransport({
  api: '/api/createAgent',
});

export default function AgentPage() {
  const [input, setInput] = useState('');
  const { messages, sendMessage, status, error } = useChat({
    transport,
  });

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      <h4 className="pb-4 text-xl font-bold text-gray-900 md:text-xl">
        LangChain Agent Example
      </h4>
      <p className="pb-4 text-sm text-gray-600">
        Ask about the weather in any city! This uses LangChain&apos;s{' '}
        <code className="bg-gray-100 px-1 rounded">createAgent</code> with the
        AI SDK adapter.
      </p>
      {error && (
        <div className="fixed top-0 left-0 w-full p-4 text-center text-white bg-red-500">
          {error.message}
        </div>
      )}
      <div className="flex-1 overflow-y-auto mb-20">
        {messages.map(m => (
          <div key={m.id} className="whitespace-pre-wrap mb-4">
            <div className="font-bold">
              {m.role === 'user' ? 'You: ' : 'Assistant: '}
            </div>
            {m.parts.map((part, i) => {
              if (part.type === 'text') {
                return <div key={i}>{part.text}</div>;
              }
              // Tool invocation parts have type 'tool-${toolName}'
              if (part.type.startsWith('tool-')) {
                return (
                  <div
                    key={i}
                    className="p-2 my-2 bg-gray-100 rounded text-sm"
                  >
                    <div className="font-semibold">🔧 Tool: {part.type}</div>
                    {'input' in part && (
                      <div className="text-gray-600">
                        Input: {JSON.stringify(part.input)}
                      </div>
                    )}
                    {'output' in part && part.output !== undefined && (
                      <div className="text-green-600">
                        Result: {JSON.stringify(part.output)}
                      </div>
                    )}
                  </div>
                );
              }
              return null;
            })}
          </div>
        ))}
        {status === 'streaming' && (
          <div className="text-gray-500 animate-pulse">Thinking...</div>
        )}
      </div>
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
          placeholder="What's the weather in San Francisco?"
          onChange={e => setInput(e.target.value)}
          disabled={status === 'streaming'}
        />
      </form>
    </div>
  );
}
