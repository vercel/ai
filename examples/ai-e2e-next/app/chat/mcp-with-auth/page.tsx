'use client';

import ChatInput from '@/components/chat-input';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useState } from 'react';

const api = '/api/chat/mcp-with-auth';

export default function Chat() {
  const [authorizationUrl, setAuthorizationUrl] = useState<string>();
  const { error, status, sendMessage, messages, regenerate, stop } = useChat({
    transport: new DefaultChatTransport({
      api,
      fetch: async (input, init) => {
        // Establish an HttpOnly browser session before sending chat messages.
        const session = await fetch(api, {
          cache: 'no-store',
          signal: init?.signal,
        });
        if (!session.ok) return session;
        return fetch(input, init);
      },
    }),
    onData: dataPart => {
      if (dataPart.type === 'data-oauth') {
        const data = dataPart.data;
        if (
          typeof data === 'object' &&
          data !== null &&
          'url' in data &&
          typeof data.url === 'string'
        ) {
          setAuthorizationUrl(data.url);
        }
      }
    },
  });

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      {authorizationUrl && (
        <div className="mb-4">
          <a href={authorizationUrl} target="_blank" rel="noopener noreferrer">
            Connect your MCP account
          </a>
          <p>After connecting, return here and retry your message.</p>
          <button
            type="button"
            disabled={status !== 'ready'}
            onClick={() => {
              setAuthorizationUrl(undefined);
              regenerate();
            }}
          >
            Retry message
          </button>
        </div>
      )}
      {messages.map(m => (
        <div key={m.id} className="whitespace-pre-wrap">
          {m.role === 'user' ? 'User: ' : 'AI: '}
          {m.parts
            .map(part => (part.type === 'text' ? part.text : ''))
            .join('')}
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
