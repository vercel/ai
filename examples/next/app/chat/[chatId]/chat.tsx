'use client';

import { invalidateRouterCache } from '@/app/actions';
import { myMessageMetadataSchema, MyUIMessage } from '@/util/chat-schema';
import { Chat2, useChat2 } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useEffect, useRef } from 'react';

export default function Chat({
  chatData,
  isNewChat = false,
}: {
  chatData: { id: string; messages: MyUIMessage[] };
  isNewChat?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const { status, append, messages } = useChat2({
    chat: new Chat2({
      id: chatData.id,
      messages: chatData.messages,
      transport: new DefaultChatTransport({
        api: '/api/chat',
        // TODO fix type safety
        prepareRequestBody: ({ chatId, messages }) => ({
          id: chatId,
          message: messages[messages.length - 1],
        }),
      }),
      messageMetadataSchema: myMessageMetadataSchema,
    }),
    onFinish() {
      // for new chats, the router cache needs to be invalidated so
      // navigation to the previous page triggers SSR correctly
      if (isNewChat) {
        invalidateRouterCache();
      }

      // focus the input field again after the response is finished
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    },
  });

  // activate the input field
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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

      <form
        onSubmit={e => {
          e.preventDefault();

          if (!inputRef.current) return;

          // TODO submit a user message
          append({
            role: 'user',
            metadata: { createdAt: Date.now() },
            parts: [{ type: 'text', text: inputRef.current.value }],
          });

          // clear the input
          inputRef.current.value = '';

          if (isNewChat) {
            window.history.pushState(null, '', `/chat/${chatData.id}`);
          }
        }}
      >
        <input
          ref={inputRef}
          className="fixed bottom-0 w-full max-w-md p-2 mb-8 border border-gray-300 rounded shadow-xl"
          placeholder="Say something..."
          disabled={status !== 'ready'}
        />
      </form>
    </div>
  );
}
