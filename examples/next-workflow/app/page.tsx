'use client';

import { useChat } from '@ai-sdk/react';
import { useRef, useEffect } from 'react';

export default function Chat() {
  const { status, sendMessage, messages } = useChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto">
      <header className="p-4 border-b">
        <h1 className="text-lg font-semibold">DurableAgent Chat</h1>
        <p className="text-sm text-gray-500">
          A durable AI agent with weather and calculator tools
        </p>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map(message => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2 ${
                message.role === 'user'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-900'
              }`}
            >
              {message.parts.map((part, index) => {
                switch (part.type) {
                  case 'text':
                    return (
                      <div key={index} className="whitespace-pre-wrap">
                        {part.text}
                      </div>
                    );
                  case 'dynamic-tool':
                    return (
                      <div
                        key={index}
                        className="my-2 p-2 bg-white/50 rounded text-sm border"
                      >
                        <div className="font-mono text-xs text-gray-500">
                          {part.toolName}
                        </div>
                        {part.state === 'output-available' && (
                          <pre className="mt-1 text-xs overflow-x-auto">
                            {JSON.stringify(part.output, null, 2)}
                          </pre>
                        )}
                      </div>
                    );
                  default:
                    return null;
                }
              })}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form
        className="p-4 border-t flex gap-2"
        onSubmit={e => {
          e.preventDefault();
          const input = e.currentTarget.elements.namedItem(
            'message',
          ) as HTMLInputElement;
          if (input.value.trim()) {
            sendMessage({ text: input.value });
            input.value = '';
          }
        }}
      >
        <input
          name="message"
          type="text"
          placeholder="Ask about weather or math..."
          className="flex-1 rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={status === 'streaming' || status === 'submitted'}
        />
        <button
          type="submit"
          className="rounded-lg bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:opacity-50"
          disabled={status === 'streaming' || status === 'submitted'}
        >
          Send
        </button>
      </form>
    </div>
  );
}
