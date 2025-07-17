'use client';

import { useActiveChat } from '@/app/chat-context';
import { MyUIMessage } from '@/util/chat-schema';
import { Chat, useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import ChatInput from './chat-input';
import Message from './message';

export const chatOptions = {
  transport: new DefaultChatTransport({
    prepareSendMessagesRequest: ({ id, messages, trigger, messageId }) => {
      switch (trigger) {
        case 'regenerate-assistant-message':
          // omit messages data transfer, only send the messageId:
          return {
            body: {
              trigger: 'regenerate-assistant-message',
              id,
              messageId,
            },
          };

        case 'submit-user-message':
          // only send the last message to the server to limit the request size:
          return {
            body: {
              trigger: 'submit-user-message',
              id,
              message: messages[messages.length - 1],
              messageId,
            },
          };

        case 'submit-tool-result':
          throw new Error(`submit-tool-result is not supported`);
      }
    },
  }),
};

export const createChat = (id?: string, messages?: MyUIMessage[]) =>
  new Chat<MyUIMessage>({
    id,
    messages,
    ...chatOptions,
  });

export default function ChatComponent({
  chatData,
  isNewChat = false,
  resume = false,
}: {
  chatData: { id: string; messages: MyUIMessage[] };
  isNewChat?: boolean;
  resume?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { chat, setOrCreateChat } = useActiveChat(chatData);
  const router = useRouter();

  const { status, sendMessage, messages, regenerate } = useChat({
    chat,
    resume,
    onFinish() {
      // focus the input field again after the response is finished
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    },
    ...chatOptions,
  });

  // activate the input field
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      {messages.map(message => (
        <Message
          key={message.id}
          message={message}
          regenerate={regenerate}
          sendMessage={sendMessage}
          status={status}
        />
      ))}
      <ChatInput
        status={status}
        onSubmit={text => {
          if (isNewChat) {
            router.push(`/chat/${chat?.id}`);
          }
          sendMessage({ text, metadata: { createdAt: Date.now() } });
        }}
        inputRef={inputRef}
      />
    </div>
  );
}
