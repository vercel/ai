'use client';

<<<<<<< HEAD
import { Message, useChat } from '@ai-sdk/react';
=======
import ChatInput from '@/component/chat-input';
import { UIMessage, useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9
import { createIdGenerator } from 'ai';

export default function Chat({
  id,
  initialMessages,
<<<<<<< HEAD
}: { id?: string | undefined; initialMessages?: Message[] } = {}) {
  const { input, status, handleInputChange, handleSubmit, messages, stop } =
    useChat({
      api: '/api/use-chat-resilient-persistence',
      id, // use the provided chatId
      initialMessages, // initial messages if provided
      sendExtraMessageFields: true, // send id and createdAt for each message
      generateId: createIdGenerator({ prefix: 'msgc', size: 16 }), // id format for client-side messages
    });
=======
}: { id?: string | undefined; initialMessages?: UIMessage[] } = {}) {
  const { sendMessage, status, messages, stop } = useChat({
    id,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: '/api/use-chat-resilient-persistence',
    }),
    generateId: createIdGenerator({ prefix: 'msgc', size: 16 }), // id format for client-side messages
  });
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9

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

<<<<<<< HEAD
      <form onSubmit={handleSubmit}>
        <input
          className="fixed bottom-0 w-full max-w-md p-2 mb-8 border border-gray-300 rounded shadow-xl"
          value={input}
          placeholder="Say something..."
          onChange={handleInputChange}
          disabled={status !== 'ready'}
        />
        {status === 'streaming' && (
          <button
            className="fixed bottom-0 w-full max-w-md p-2 mb-8 border border-gray-300 rounded shadow-xl"
            type="submit"
            onClick={stop}
          >
            Stop
          </button>
        )}
      </form>
=======
      <ChatInput
        status={status}
        stop={stop}
        onSubmit={text => sendMessage({ text })}
      />
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9
    </div>
  );
}
