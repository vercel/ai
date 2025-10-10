'use client';

import { OpenAIWebSearchMessage } from '@/agent/openai-web-search-agent';
import ChatInput from '@/component/chat-input';
import OpenAIWebSearchView from '@/component/openai-web-search-view';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

export default function TestOpenAIWebSearch() {
  const { error, status, sendMessage, messages, regenerate, stop } =
    useChat<OpenAIWebSearchMessage>({
      transport: new DefaultChatTransport({
        api: '/api/chat-openai-web-search',
      }),
    });

  return (
    <div className="flex flex-col py-24 mx-auto w-full max-w-md stretch">
      <h1 className="mb-4 text-xl font-bold">OpenAI Web Search Test</h1>

      {messages.map(message => (
        <div key={message.id} className="whitespace-pre-wrap">
          {message.role === 'user' ? 'User: ' : 'AI: '}
          {message.parts.map((part, index) => {
            if (part.type === 'text') {
              return <div key={index}>{part.text}</div>;
            }

            if (part.type === 'tool-web_search') {
              return <OpenAIWebSearchView invocation={part} key={index} />;
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
            className="px-4 py-2 mt-4 text-blue-500 rounded-md border border-blue-500"
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
            className="px-4 py-2 mt-4 text-blue-500 rounded-md border border-blue-500"
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
