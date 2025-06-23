'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import ChatInput from '@/component/chat-input';
import { OpenAIWebSearchMessage } from '@/app/api/chat-openai-web-search/route';

export default function TestOpenAIWebSearch() {
  const { error, status, sendMessage, messages, regenerate, stop } =
    useChat<OpenAIWebSearchMessage>({
      transport: new DefaultChatTransport({
        api: '/api/chat-openai-web-search',
      }),
    });

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      <h1 className="mb-4 text-xl font-bold">
        OpenAI Web Search Block-Based Streaming Test
      </h1>

      {messages.map(message => (
        <div key={message.id} className="whitespace-pre-wrap">
          {message.role === 'user' ? 'User: ' : 'AI: '}
          {message.parts.map((part, index) => {
            if (part.type === 'text') {
              return <div key={index}>{part.text}</div>;
            }

            if (part.type === 'tool-web_search_preview') {
              if (part.state === 'input-available') {
                return (
                  <pre
                    key={index}
                    className="overflow-auto p-2 text-sm bg-gray-100 rounded"
                  >
                    {JSON.stringify(part.input, null, 2)}
                  </pre>
                );
              }
              if (part.state === 'output-available') {
                return (
                  <pre
                    key={index}
                    className="overflow-auto p-2 text-sm bg-gray-100 rounded"
                  >
                    {JSON.stringify(part.input, null, 2)}
                    {`\n\nDONE - Web search completed`}
                  </pre>
                );
              }
            }

            if (part.type === 'source-url') {
              return (
                <span key={index}>
                  [
                  <a
                    href={part.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-bold text-blue-500 hover:underline"
                  >
                    {part.title ?? new URL(part.url).hostname}
                  </a>
                  ]
                </span>
              );
            }

            return null;
          })}
        </div>
      ))}

      {(status === 'submitted' || status === 'streaming') && (
        <div className="mt-4 text-gray-500">
          {status === 'submitted' && <div>Loading...</div>}
          <button
            type="button"
            className="px-4 py-2 mt-4 text-blue-500 border border-blue-500 rounded-md"
            onClick={stop}
          >
            Stop
          </button>
        </div>
      )}

      {error && (
        <div className="mt-4">
          <div className="text-red-500">An error occurred.</div>
          <button
            type="button"
            className="px-4 py-2 mt-4 text-blue-500 border border-blue-500 rounded-md"
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
