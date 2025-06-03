'use client';

import { myMessageMetadataSchema, MyUIMessage } from '@/util/chat-schema';
import { createChat2, useChat2 } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

export default function Chat({
  chatData,
}: {
  chatData: { id: string; messages: MyUIMessage[] };
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
        messageMetadataSchema: myMessageMetadataSchema,
      }),
    },
  );

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      {messages.map(m => {
        const date = m.metadata?.createdAt
          ? new Date(m.metadata.createdAt).toLocaleString()
          : '';
        const isUser = m.role === 'user';
        return (
          <div
            key={m.id}
            className={`whitespace-pre-wrap my-2 p-3 rounded-lg shadow
              ${isUser ? 'bg-blue-100 text-right ml-10' : 'bg-gray-100 text-left mr-10'}`}
          >
            <div className="mb-1 text-xs text-gray-500">{date}</div>
            <div className="font-semibold">{isUser ? 'User:' : 'AI:'}</div>
            <div>
              {m.parts
                .map(part => (part.type === 'text' ? part.text : ''))
                .join('')}
            </div>
          </div>
        );
      })}

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
