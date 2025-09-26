'use client';

import AnthropicWebFetchView from '@/component/anthropic-web-fetch-view';
import ChatInput from '@/component/chat-input';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { AnthropicWebFetchMessage } from '../api/anthropic-web-fetch/route';

export default function TestAnthropicWebFetch() {
  const { status, sendMessage, messages } = useChat<AnthropicWebFetchMessage>({
    transport: new DefaultChatTransport({
      api: '/api/anthropic-web-fetch',
    }),
  });

  return (
    <div className="flex flex-col py-24 mx-auto w-full max-w-md stretch">
      <h1 className="mb-4 text-xl font-bold">Anthropic Web Fetch Test</h1>

      {messages.map(message => (
        <div key={message.id} className="whitespace-pre-wrap">
          {message.role === 'user' ? 'User: ' : 'AI: '}
          {message.parts.map((part, index) => {
            if (part.type === 'text') {
              return <div key={index}>{part.text}</div>;
            }

            if (part.type === 'tool-web_fetch') {
              return <AnthropicWebFetchView invocation={part} key={index} />;
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

      <ChatInput status={status} onSubmit={text => sendMessage({ text })} />
    </div>
  );
}
