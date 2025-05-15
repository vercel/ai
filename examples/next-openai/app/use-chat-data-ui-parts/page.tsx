'use client';

import { useChat } from '@ai-sdk/react';
import { defaultChatStore } from 'ai';

export default function Chat() {
  const {
    error,
    input,
    status,
    handleInputChange,
    handleSubmit,
    messages,
    reload,
    stop,
  } = useChat<
    unknown,
    {
      weather: {
        city: string;
        weather: string;
        status: 'loading' | 'success';
      };
    }
  >({
    chatStore: defaultChatStore({
      api: '/api/use-chat-data-ui-parts',
    }),
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
                {part.value.status === 'loading' ? (
                  <>
                    Getting weather for <b>{part.value.city}</b>...
                  </>
                ) : part.value.status === 'success' ? (
                  <>
                    Weather in <b>{part.value.city}</b>:{' '}
                    <b>{part.value.weather}</b>
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

      <form onSubmit={handleSubmit}>
        <input
          className="fixed bottom-0 w-full max-w-md p-2 mb-8 border border-gray-300 rounded shadow-xl"
          value={input}
          placeholder="Say something..."
          onChange={handleInputChange}
          disabled={status !== 'ready'}
        />
      </form>
    </div>
  );
}
