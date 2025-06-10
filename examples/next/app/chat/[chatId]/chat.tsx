'use client';

import { invalidateRouterCache } from '@/app/actions';
import { MyUIMessage } from '@/util/chat-schema';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useEffect, useRef } from 'react';
import ChatInput from './chat-input';
import Message from './message';

export default function ChatComponent({
  chatData,
  isNewChat = false,
}: {
  chatData: { id: string; messages: MyUIMessage[] };
  isNewChat?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const { status, sendMessage, messages } = useChat({
    id: chatData.id,
    messages: chatData.messages,
    transport: new DefaultChatTransport({
      // only send the last message to the server to limit the request size:
      prepareRequest: ({ id, messages }) => ({
        body: { id, message: messages[messages.length - 1] },
      }),
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
      {messages.map(message => (
        <Message key={message.id} message={message} />
      ))}
      <ChatInput
        status={status}
        onSubmit={text => {
          sendMessage({ text, metadata: { createdAt: Date.now() } });

          if (isNewChat) {
            window.history.pushState(null, '', `/chat/${chatData.id}`);
          }
        }}
        inputRef={inputRef}
      />
    </div>
  );
}
