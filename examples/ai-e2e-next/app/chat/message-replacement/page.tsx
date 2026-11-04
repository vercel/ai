'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { memo } from 'react';

const originalMessageId = 'original-message-id';
const replacementMessageId = 'replacement-message-id';

const Message = memo(
  function Message({ message }: { message: UIMessage }) {
    return (
      <div data-testid={`message-${message.id}`}>
        <div data-testid={`message-id-${message.id}`}>{message.id}</div>
        <div>
          {message.parts
            .map(part => (part.type === 'text' ? part.text : ''))
            .join('')}
        </div>
      </div>
    );
  },
  (previous, next) =>
    previous.message.role === 'user' &&
    next.message.role === 'user' &&
    previous.message.id === next.message.id,
);

export default function Page() {
  const { messages, sendMessage, status } = useChat({
    messages: [
      {
        id: originalMessageId,
        role: 'user',
        parts: [{ type: 'text', text: 'Original message' }],
      },
    ],
    transport: new DefaultChatTransport({
      api: '/api/chat/message-replacement',
    }),
  });

  return (
    <div className="flex flex-col w-full max-w-lg py-12 mx-auto gap-4">
      <h4 className="text-xl font-bold">useChat message replacement</h4>
      <p>
        The memoized user message view only rerenders when its message ID
        changes.
      </p>

      <button
        className="px-3 py-1 text-white bg-black rounded disabled:opacity-50"
        data-testid="replace-message"
        disabled={status !== 'ready'}
        onClick={() => {
          sendMessage({
            id: replacementMessageId,
            parts: [{ type: 'text', text: 'Replacement message' }],
            messageId: originalMessageId,
          });
        }}
      >
        Replace message
      </button>

      <div className="flex flex-col gap-2">
        {messages.map(message => (
          <Message key={message.id} message={message} />
        ))}
      </div>
    </div>
  );
}
