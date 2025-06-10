'use client';

import ChatInput from '@/component/chat-input';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { z } from 'zod';

export default function Chat() {
  const { error, status, sendMessage, messages, reload, stop } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/use-chat-data-ui-parts',
    }),
    dataPartSchemas: {
      weather: z.object({
        city: z.string(),
        weather: z.string(),
        status: z.enum(['loading', 'success']),
      }),
    },
  });

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      {messages.map(message => (
        <div key={message.id} className="whitespace-pre-wrap">
          {message.role === 'user' ? 'User: ' : 'AI: '}{' '}
          {message.parts
            .filter(part => part.type === 'data-weather')
            .map((part, index) => (
              <span
                key={index}
                style={{
                  border: '2px solid red',
                  padding: '2px',
                  borderRadius: '4px',
                  display: 'inline-block',
                  minWidth: '180px',
                }}
              >
                {part.data.status === 'loading' ? (
                  <>
                    Getting weather for <b>{part.data.city}</b>...
                  </>
                ) : part.data.status === 'success' ? (
                  <>
                    Weather in <b>{part.data.city}</b>:{' '}
                    <b>{part.data.weather}</b>
                  </>
                ) : (
                  <>Unknown weather state</>
                )}
              </span>
            ))}
          {message.parts
            .filter(part => part.type !== 'data-weather')
            .map((part, index) => {
              if (part.type === 'text') {
                return <div key={index}>{part.text}</div>;
              }
            })}
        </div>
      ))}

      {(status === 'submitted' || status === 'streaming') && (
        <div className="mt-4 text-gray-500">
          {status === 'submitted' && <div>Loading...</div>}
          <button
            type="button"
            className="px-4 py-2 mt-4 text-blue-500 border border-blue-500 rounded-md"
            onClick={stop}
          >
            Stop
          </button>
        </div>
      )}

      {error && (
        <div className="mt-4">
          <div className="text-red-500">An error occurred.</div>
          <button
            type="button"
            className="px-4 py-2 mt-4 text-blue-500 border border-blue-500 rounded-md"
            onClick={() => reload()}
          >
            Retry
          </button>
        </div>
      )}

      <ChatInput status={status} onSubmit={text => sendMessage({ text })} />
    </div>
  );
}
