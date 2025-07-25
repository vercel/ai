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
  resume = false,
}: {
  chatData: { id: string; messages: MyUIMessage[] };
  isNewChat?: boolean;
  resume?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const { status, sendMessage, messages, regenerate } = useChat({
    id: chatData.id,
    messages: chatData.messages,
    resume,
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
            return {
              body: {
                trigger: 'submit-tool-result',
                id,
                messages,
                messageId,
              },
            };
        }
      },
    }),
    onFinish() {
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
