'use client';

import { useChat } from '@ai-sdk/react';

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
  } = useChat({
    api: '/api/use-chat-reasoning',
  });

  return (
    <div className="flex flex-col w-full max-w-2xl py-24 mx-auto stretch">
      {messages.map(message => (
        <div
          key={message.id}
          className="flex gap-4 pb-4 mb-6 border-b border-gray-100 last:border-0"
        >
          <div className="font-medium min-w-[50px]">
            {message.role === 'user' ? 'User:' : 'AI:'}
          </div>
          <div className="flex-1">
            {message.parts.map((part, index) => {
              if (part.type === 'text') {
                return (
                  <pre
                    key={index}
                    className="max-w-full overflow-x-auto break-words whitespace-pre-wrap"
                  >
                    {part.text}
                  </pre>
                );
              }

              if (part.type === 'reasoning') {
                return (
                  <pre
                    key={index}
                    className="max-w-full mb-4 overflow-x-auto italic text-gray-500 break-words whitespace-pre-wrap"
                  >
                    {part.reasoning}
                  </pre>
                );
              }
            })}
          </div>
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
          className="fixed bottom-0 w-full max-w-2xl p-2 mb-8 border border-gray-300 rounded shadow-xl"
          value={input}
          placeholder="Say something..."
          onChange={handleInputChange}
          disabled={status !== 'ready'}
        />
      </form>
    </div>
  );
}
