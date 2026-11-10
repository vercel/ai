'use client';

import ChatInput from '@/components/chat-input';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

export default function ChatDeepSeekResponses() {
  const { messages, sendMessage, status, error, regenerate, stop } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat/deepseek-responses',
    }),
  });

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto">
      <h1 className="mb-4 text-xl font-bold">DeepSeek Responses</h1>

      {messages.map(message => (
        <div key={message.id} className="mb-4 whitespace-pre-wrap">
          <div className="mb-1 font-semibold">
            {message.role === 'user' ? 'User:' : 'AI:'}
          </div>
          {message.parts.map((part, index) => {
            if (part.type === 'text') {
              return <div key={index}>{part.text}</div>;
            }
            if (part.type === 'reasoning') {
              return (
                <div key={index} className="mb-2 text-sm text-gray-500">
                  <strong>Reasoning:</strong> {part.text}
                </div>
              );
            }
          })}
        </div>
      ))}

      {(status === 'submitted' || status === 'streaming') && (
        <div className="mb-4">
          {status === 'submitted' && <div>Loading...</div>}
          <button type="button" className="text-blue-500" onClick={stop}>
            Stop
          </button>
        </div>
      )}

      {error && (
        <div className="mb-4">
          <div role="alert" className="text-red-500">
            {error.message}
          </div>
          <button
            type="button"
            className="text-blue-500"
            onClick={() => regenerate()}
          >
            Retry
          </button>
        </div>
      )}

      <ChatInput status={status} onSubmit={text => sendMessage({ text })} />
    </div>
  );
}
