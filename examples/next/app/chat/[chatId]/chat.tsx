'use client';

import { createChat2, useChat2 } from '@ai-sdk/react';
import { DefaultChatTransport, UIMessage } from 'ai';

export default function Chat({
  chatData,
}: {
  chatData: { id: string; messages: UIMessage[] };
}) {
  const { input, status, handleInputChange, handleSubmit, messages } = useChat2(
    {
      chat: createChat2({
        id: chatData.id,
        messages: chatData.messages,
        transport: new DefaultChatTransport({
          api: '/api/chat',
          prepareRequestBody: ({ chatId, messages }) => ({
            chatId,
            message: messages[messages.length - 1],
          }),
        }),
      }),
    },
  );

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      {messages.map(m => (
        <div key={m.id} className="whitespace-pre-wrap">
          {m.role === 'user' ? 'User: ' : 'AI: '}
          {m.parts
            .map(part => (part.type === 'text' ? part.text : ''))
            .join('')}
        </div>
      ))}

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
