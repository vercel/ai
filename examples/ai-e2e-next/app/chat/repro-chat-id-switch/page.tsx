'use client';

/**
 * Reproduction for Bug #5: Chat ID change does not abort previous stream
 *
 * Bug: When useChat id changes (e.g. chat-1 -> chat-2) during streaming,
 * chatRef.current is replaced with a new Chat instance, but the previous
 * Chat's stream is never aborted. The old fetch continues, wasting resources.
 *
 * Repro steps:
 * 1. Click "Send" (starts ~6s slow stream)
 * 2. While streaming, click "Switch to chat-2"
 * 3. Bug: old stream continues. Fixed: old stream aborted (check server log
 *    "ABORTED" vs "COMPLETED", or Network tab shows request cancelled)
 *
 * See: packages/react/src/use-chat.ts lines 101-108
 */
import { useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { UIMessage } from 'ai';

export default function ReproChatIdSwitchPage() {
  const [chatId, setChatId] = useState<'chat-1' | 'chat-2'>('chat-1');

  const { messages, sendMessage, status, id } = useChat<UIMessage>({
    id: chatId,
    transport: new DefaultChatTransport({
      api: '/api/chat/repro-chat-id-switch',
    }),
    onFinish: ({ message }) => {
      console.log(`[onFinish] chatId=${id} messageId=${message.id}`);
    },
  });

  return (
    <div className="flex flex-col py-24 mx-auto w-full max-w-md stretch">
      <h1 className="mb-4 text-xl font-bold">
        Bug #5 Repro: Chat ID Switch No Abort
      </h1>
      <p className="mb-4 text-sm text-gray-600">
        1. Click &quot;Send&quot; (starts ~6s stream).
        <br />
        2. While streaming, click &quot;Switch to chat-2&quot;.
        <br />
        3. Bug: old stream continues. Fixed: Network tab shows request
        cancelled, server logs &quot;ABORTED&quot;.
      </p>

      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => setChatId('chat-1')}
          className={`rounded px-3 py-1.5 text-sm ${
            chatId === 'chat-1'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-700'
          }`}
        >
          chat-1
        </button>
        <button
          type="button"
          onClick={() => setChatId('chat-2')}
          className={`rounded px-3 py-1.5 text-sm ${
            chatId === 'chat-2'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-700'
          }`}
        >
          chat-2
        </button>
      </div>

      <form
        onSubmit={e => {
          e.preventDefault();
          sendMessage({ text: 'hello' });
        }}
        className="mb-4"
      >
        <button
          type="submit"
          className="rounded bg-green-600 px-4 py-2 text-white"
        >
          Send (streams ~6s)
        </button>
      </form>

      <p className="mb-2 text-xs text-gray-500">
        Current: {id} | Status: {status}
      </p>
      {messages.map((message, index) => (
        <div
          key={`${message.id}-${index}`}
          className="whitespace-pre-wrap mb-2"
        >
          <strong>{`${message.role}: `}</strong>
          {message.parts.map((part, i) => {
            if (part.type === 'text') return <span key={i}>{part.text}</span>;
            return null;
          })}
        </div>
      ))}
    </div>
  );
}
