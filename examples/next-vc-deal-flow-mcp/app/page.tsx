'use client';

import { useChat } from '@ai-sdk/react';
import { useState } from 'react';

const STARTER_PROMPTS = [
  'Which AI/ML startups had the strongest engineering momentum this week?',
  'Compare engineering activity at Anthropic, OpenAI, and Cohere.',
  'Find dark-horse fintech startups with breakout commit-velocity but no major press.',
];

export default function Page() {
  const { messages, sendMessage, status } = useChat();
  const [input, setInput] = useState('');

  return (
    <main className="flex flex-col py-12 mx-auto w-full max-w-2xl px-4">
      <h1 className="text-2xl font-semibold mb-1">VC Deal Flow Research</h1>
      <p className="text-sm text-gray-600 mb-6">
        Streaming agent that calls a public, no-auth MCP server to surface
        engineering momentum at venture-backed startups.
      </p>

      {messages.length === 0 && (
        <div className="flex flex-col gap-2 mb-6">
          {STARTER_PROMPTS.map(p => (
            <button
              key={p}
              type="button"
              onClick={() => sendMessage({ text: p })}
              className="text-left text-sm border border-gray-300 rounded p-3 hover:bg-gray-50"
            >
              {p}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-4">
        {messages.map(message => (
          <div key={message.id} className="whitespace-pre-wrap">
            <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">
              {message.role}
            </div>
            {message.parts.map((part, index) => {
              switch (part.type) {
                case 'text':
                  return <div key={index}>{part.text}</div>;
                case 'step-start':
                  return index > 0 ? (
                    <hr key={index} className="my-2 border-gray-200" />
                  ) : null;
                default:
                  if (part.type.startsWith('tool-')) {
                    return (
                      <pre
                        key={index}
                        className="text-xs bg-gray-50 border border-gray-200 rounded p-2 my-2 overflow-x-auto"
                      >
                        {part.type}
                        {'state' in part ? ` (${(part as any).state})` : ''}
                      </pre>
                    );
                  }
                  return null;
              }
            })}
          </div>
        ))}
      </div>

      <form
        onSubmit={e => {
          e.preventDefault();
          if (input.trim() === '') return;
          sendMessage({ text: input });
          setInput('');
        }}
        className="mt-6"
      >
        <input
          className="w-full p-2 border border-gray-300 rounded"
          placeholder="Ask about a startup, sector, or trend..."
          disabled={status !== 'ready'}
          value={input}
          onChange={e => setInput(e.target.value)}
        />
      </form>
    </main>
  );
}
