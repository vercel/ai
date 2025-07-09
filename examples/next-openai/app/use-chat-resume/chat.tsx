'use client';

import { useChat } from '@ai-sdk/react';
<<<<<<< HEAD
import { Message } from 'ai';
import Link from 'next/link';
import { useEffect } from 'react';

export function Chat({
  chatId,
  autoResume,
  initialMessages = [],
}: {
  chatId: string;
  autoResume: boolean;
  initialMessages: Message[];
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
    id: chatId,
    api: '/api/use-chat-resume',
    initialMessages,
    sendExtraMessageFields: true,
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
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch gap-8">
      <Link href={`/use-chat-resume/${chatId}`} target="_noblank">
        Chat Id: {chatId}
=======
import { DefaultChatTransport, type UIMessage } from 'ai';
import Link from 'next/link';
import ChatInput from '@component/chat-input';

export function Chat({
  id,
  autoResume,
  initialMessages = [],
}: {
  id: string;
  autoResume: boolean;
  initialMessages: UIMessage[];
}) {
  const { error, status, sendMessage, messages, regenerate, stop } = useChat({
    id,
    messages: initialMessages,
    transport: new DefaultChatTransport({ api: '/api/use-chat-resume' }),
    onError: error => {
      console.error('Error streaming text:', error);
    },
    resume: autoResume,
  });

  return (
    <div className="flex flex-col w-full max-w-md gap-8 py-24 mx-auto stretch">
      <Link href={`/use-chat-resume/${id}`} target="_noblank">
        Chat Id: {id}
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9
      </Link>

      <div>Status: {status}</div>

      {messages.map(message => (
<<<<<<< HEAD
        <div key={message.id} className="whitespace-pre-wrap flex flex-row">
=======
        <div key={message.id} className="flex flex-row whitespace-pre-wrap">
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9
          <div className="min-w-12">
            {message.role === 'user' ? 'User: ' : 'AI: '}
          </div>

          <div>
            <div className="text-sm text-zinc-500">{message.id}</div>
<<<<<<< HEAD
            {message.parts
              .filter(part => part.type !== 'source')
              .map((part, partIndex) => {
                if (part.type === 'text') {
                  return (
                    <div key={`${message.id}-${partIndex}`}>{part.text}</div>
                  );
                }
              })}
=======
            {message.parts.map((part, partIndex) => {
              if (part.type === 'text') {
                return (
                  <div key={`${message.id}-${partIndex}`}>{part.text}</div>
                );
              }
            })}
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9
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
<<<<<<< HEAD
            onClick={() => reload()}
=======
            onClick={() => regenerate()}
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9
          >
            Retry
          </button>
        </div>
      )}

<<<<<<< HEAD
      <form onSubmit={handleSubmit}>
        <input
          className="fixed bottom-0 w-full max-w-md p-2 mb-8 border border-gray-300 rounded shadow-xl"
          value={input}
          placeholder="Say something..."
          onChange={handleInputChange}
          disabled={status !== 'ready'}
        />
      </form>
=======
      <ChatInput status={status} onSubmit={text => sendMessage({ text })} />
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9
    </div>
  );
}
