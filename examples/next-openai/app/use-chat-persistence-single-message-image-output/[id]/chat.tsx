'use client';

import { createIdGenerator } from 'ai';
import { UIMessage, useChat } from '@ai-sdk/react';

export default function Chat({
  id,
  initialMessages,
}: { id?: string | undefined; initialMessages?: UIMessage[] } = {}) {
  const { input, handleInputChange, handleSubmit, messages } = useChat({
    api: '/api/use-chat-persistence-single-message-image-output',
    id, // use the provided chatId
    initialMessages, // initial messages if provided
    sendExtraMessageFields: true, // send id and createdAt for each message
    generateId: createIdGenerator({ prefix: 'msgc', size: 16 }), // id format for client-side messages

    // only send the last message to the server:
    experimental_prepareRequestBody({ messages, id }) {
      return { message: messages[messages.length - 1], id };
    },
  });

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      {messages.map(message => (
        <div key={message.id} className="whitespace-pre-wrap">
          {message.role === 'user' ? 'User: ' : 'AI: '}
          {message.parts.map((part, index) => {
            if (part.type === 'text') {
              return <div key={index}>{part.text}</div>;
            } else if (
              part.type === 'file' &&
              part.mediaType.startsWith('image/')
            ) {
              return (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={index} src={part.url} alt="Generated image" />
              );
            }
          })}
        </div>
      ))}

      <form onSubmit={handleSubmit}>
        <input
          className="fixed bottom-0 w-full max-w-md p-2 mb-8 border border-gray-300 rounded shadow-xl"
          value={input}
          placeholder="Say something..."
          onChange={handleInputChange}
        />
      </form>
    </div>
  );
}
