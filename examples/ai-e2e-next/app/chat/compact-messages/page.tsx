'use client';

import type {
  CompactionChatMessage,
  ConversationState,
} from '@/app/api/chat/compact-messages/types';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useRef, useState } from 'react';

export default function CompactionChat() {
  // The model's compacted context is separate from the full visible transcript.
  const contextRef = useRef<ConversationState>({ messages: [] });
  const [text, setText] = useState('');
  const [transport] = useState(
    () =>
      new DefaultChatTransport<CompactionChatMessage>({
        api: '/api/chat/compact-messages',
        prepareSendMessagesRequest: ({ messages }) => ({
          body: {
            message: messages.at(-1),
            context: contextRef.current,
          },
        }),
      }),
  );
  const { messages, sendMessage, status, error, stop } =
    useChat<CompactionChatMessage>({
      transport,
      onData: part => {
        if (part.type === 'data-context') contextRef.current = part.data;
      },
    });
  const busy = status === 'submitted' || status === 'streaming';

  return (
    <main className="max-w-2xl px-4 py-12 mx-auto">
      <h1 className="text-xl font-bold">Message compaction</h1>
      <p className="mt-2 text-sm text-zinc-600">
        Chat with a live ToolLoopAgent. At 8 model-context messages, including
        tool messages, it summarizes older context automatically. Your full chat
        stays visible here.
      </p>
      <p className="mt-2 text-sm text-zinc-600">
        Try asking for the current time, share a few details to remember, then
        ask about them after compaction.
      </p>

      <div className="flex flex-col gap-6 my-8">
        {messages.map(message => (
          <div key={message.id}>
            <div className="mb-1 font-semibold">
              {message.role === 'user' ? 'You' : 'Assistant'}
            </div>
            {message.parts.map((part, index) => {
              if (part.type === 'text') {
                return (
                  <div key={index} className="whitespace-pre-wrap">
                    {part.text}
                  </div>
                );
              }

              if (part.type === 'data-compaction') {
                return (
                  <div
                    key={index}
                    role="status"
                    className="p-3 my-2 text-sm bg-amber-50 border border-amber-300 rounded"
                  >
                    {part.data.status === 'running' ? (
                      busy && message.id === messages.at(-1)?.id ? (
                        <>Compacting {part.data.beforeMessages} messages…</>
                      ) : (
                        <>Compaction interrupted.</>
                      )
                    ) : (
                      <>
                        Context compacted: {part.data.beforeMessages} →{' '}
                        {part.data.afterMessages} messages.
                      </>
                    )}
                  </div>
                );
              }

              if (part.type === 'tool-getTime') {
                return (
                  <div key={index} className="my-2 text-sm text-zinc-500">
                    {part.state === 'output-available'
                      ? `Current time: ${JSON.stringify(part.output)}`
                      : 'Getting the current time…'}
                  </div>
                );
              }
            })}
          </div>
        ))}
      </div>

      {error && <p className="mb-4 text-red-600">{error.message}</p>}
      {busy && <p className="mb-4 text-sm text-zinc-500">Working…</p>}

      <form
        className="flex gap-2"
        onSubmit={event => {
          event.preventDefault();
          if (busy || !text.trim()) return;
          void sendMessage({ text });
          setText('');
        }}
      >
        <input
          aria-label="Message"
          className="flex-1 min-w-0 p-2 border border-gray-300 rounded"
          placeholder="Say something…"
          value={text}
          onChange={event => setText(event.target.value)}
          disabled={busy}
        />
        {busy ? (
          <button type="button" className="px-3 border rounded" onClick={stop}>
            Stop
          </button>
        ) : (
          <button
            type="submit"
            className="px-3 border rounded"
            disabled={!text.trim()}
          >
            Send
          </button>
        )}
      </form>
    </main>
  );
}
