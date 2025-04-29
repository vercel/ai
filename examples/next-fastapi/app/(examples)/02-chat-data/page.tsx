'use client';

import { Card } from '@/app/components';
import { useChat } from '@ai-sdk/react';
import { GeistMono } from 'geist/font/mono';

export default function Page() {
  const { messages, input, handleSubmit, handleInputChange, status } = useChat({
    streamProtocol: 'data',
    maxSteps: 3,
  });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 p-4">
        {messages.map(message => (
          <div key={message.id} className="flex flex-row gap-2">
            <div className="flex-shrink-0 w-24 text-zinc-500">{`${message.role}: `}</div>

            <div className="flex flex-col gap-2">
              {message.parts.map((part, index) => {
                switch (part.type) {
                  case 'text':
                    return <div key={index}>{part.text}</div>;
                  case 'tool-invocation': {
                    return (
                      <div
                        key={index}
                        className={`${GeistMono.className} text-sm text-zinc-500 bg-zinc-100 p-3 rounded-lg`}
                      >
                        {`${part.toolInvocation.toolName}(${JSON.stringify(
                          part.toolInvocation.args,
                          null,
                          2,
                        )})`}
                      </div>
                    );
                  }
                }
              })}
            </div>
          </div>
        ))}
      </div>

      {messages.length === 0 && <Card type="chat-data" />}

      <form
        onSubmit={handleSubmit}
        className="fixed bottom-0 flex flex-col w-full border-t"
      >
        <input
          value={input}
          placeholder="What's the weather in San Francisco?"
          onChange={handleInputChange}
          className="w-full p-4 bg-transparent outline-none"
          disabled={status !== 'ready'}
        />
      </form>
    </div>
  );
}
