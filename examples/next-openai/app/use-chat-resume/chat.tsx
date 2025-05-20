'use client';

import { useChat } from '@ai-sdk/react';
import { defaultChatStore, UIMessage } from 'ai';
import Link from 'next/link';
import { useEffect } from 'react';

export function Chat({
  chatId,
  autoResume,
  initialMessages = [],
}: {
  chatId: string;
  autoResume: boolean;
  initialMessages: UIMessage[];
}) {
  const {
    error,
    input,
    status,
    handleInputChange,
    handleSubmit,
    messages,
    reload,
    stop,
    experimental_resume,
  } = useChat({
    chatId,
    chatStore: defaultChatStore({
      api: '/api/use-chat-resume',
      chats: {
        [chatId]: {
          messages: initialMessages,
        },
      },
    }),
    onError: error => {
      console.error('Error streaming text:', error);
    },
  });

  useEffect(() => {
    if (autoResume) {
      experimental_resume();
    }
    // We want to disable the exhaustive deps rule here because we only want to run this effect once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col w-full max-w-md gap-8 py-24 mx-auto stretch">
      <Link href={`/use-chat-resume/${chatId}`} target="_noblank">
        Chat Id: {chatId}
      </Link>

      <div>Status: {status}</div>

      {messages.map(message => (
        <div key={message.id} className="flex flex-row whitespace-pre-wrap">
          <div className="min-w-12">
            {message.role === 'user' ? 'User: ' : 'AI: '}
          </div>

          <div>
            <div className="text-sm text-zinc-500">{message.id}</div>
            {message.parts.map((part, partIndex) => {
              if (part.type === 'text') {
                return (
                  <div key={`${message.id}-${partIndex}`}>{part.text}</div>
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
