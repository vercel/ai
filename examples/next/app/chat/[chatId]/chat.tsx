'use client';

import { Chat2, createChatStore, useChat2 } from '@ai-sdk/react';
import { ChatModel } from '@util/chat-store';
import {
  ChatStoreOptions,
  DefaultChatTransport,
  InferUIDataParts,
  UIDataPartSchemas,
  UIMessage,
} from 'ai';

function createChat<
  MESSAGE_METADATA = unknown,
  UI_DATA_PART_SCHEMAS extends UIDataPartSchemas = UIDataPartSchemas,
>(
  chat: {
    id: string;
    messages: UIMessage<
      MESSAGE_METADATA,
      InferUIDataParts<UI_DATA_PART_SCHEMAS>
    >[];
  } & Omit<ChatStoreOptions<MESSAGE_METADATA, UI_DATA_PART_SCHEMAS>, 'chats'>,
): Chat2<MESSAGE_METADATA, UI_DATA_PART_SCHEMAS> {
  const { id, messages, ...options } = chat;
  const store = createChatStore<MESSAGE_METADATA, UI_DATA_PART_SCHEMAS>({
    ...options,
    chats: {
      [chat.id]: {
        messages: chat.messages ?? [],
      },
    },
  });

  return {
    id: chat.id,
    status: store.getStatus(chat.id),
    get messages() {
      return store.getMessages(chat.id);
    },
    subscribe: options => store.subscribe(options),
    addToolResult: options =>
      store.addToolResult({ chatId: chat.id, ...options }),
    stopStream: () => store.stopStream({ chatId: chat.id }),
    submitMessage: options =>
      store.submitMessage({ chatId: chat.id, ...options }),
    resubmitLastUserMessage: async options => {
      await store.resubmitLastUserMessage({
        chatId: chat.id,
        ...options,
      });
    },
    resumeStream: async options => {
      await store.resumeStream({ chatId: chat.id, ...options });
    },
    setMessages: async ({ messages }) => {
      store.setMessages({ id: chat.id, messages });
    },
  };
}

export default function Chat({ chat }: { chat: ChatModel }) {
  const { input, status, handleInputChange, handleSubmit, messages } = useChat2(
    {
      chat: createChat({
        id: chat.chatId,
        messages: chat.messages,
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
