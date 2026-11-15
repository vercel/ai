'use client';

import { useChat } from '@ai-sdk/react';
import {
  generateId,
  lastAssistantMessageIsCompleteWithToolCalls,
  WebSocketChatTransport,
} from 'ai';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { WebSocketChatMessage } from './tools';

export default function WebSocketChat() {
  const [input, setInput] = useState('');
  const [transport] = useState(
    () =>
      new WebSocketChatTransport<WebSocketChatMessage>({
        url:
          process.env.NEXT_PUBLIC_WEBSOCKET_CHAT_URL ??
          'ws://127.0.0.1:3001/chat',
        params: { session: generateId() },
      }),
  );
  const {
    messages,
    sendMessage,
    addToolOutput,
    status,
    error,
    stop,
    resumeStream,
    clearError,
  } = useChat<WebSocketChatMessage>({
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onToolCall({ toolCall }) {
      if (!toolCall.dynamic && toolCall.toolName === 'getTimezone') {
        void addToolOutput({
          tool: 'getTimezone',
          toolCallId: toolCall.toolCallId,
          output: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
      }
    },
  });

  // This page owns the transport exclusively. Release its persistent socket
  // on unmount; shared transports should instead be closed by their owner.
  useEffect(() => () => transport.close(), [transport]);

  const busy = status === 'submitted' || status === 'streaming';

  return (
    <main className="flex flex-col gap-6 max-w-xl mx-auto px-4 py-12">
      <Link href="/">All examples</Link>
      <h1 className="text-2xl font-bold">Chat over WebSocket</h1>
      <p>
        Try “What is my time zone?” to run a tool in your browser. Disconnect
        during a response, then resume to replay and complete it.
      </p>
      <p role="status">Status: {status}</p>
      <div className="flex gap-3">
        <button type="button" disabled={!busy} onClick={() => stop()}>
          Stop
        </button>
        <button
          type="button"
          disabled={!busy}
          onClick={() => transport.close()}
        >
          Disconnect
        </button>
        <button type="button" disabled={busy} onClick={() => resumeStream()}>
          Resume
        </button>
      </div>
      {error && <p role="alert">{error.message}</p>}
      <div className="flex flex-col gap-6" aria-label="Messages">
        {messages.map(message => (
          <article
            key={message.id}
            data-role={message.role}
            data-message-id={message.id}
          >
            <strong>{message.role === 'user' ? 'You' : 'Assistant'}</strong>
            {message.parts.map((part, index) => {
              if (part.type === 'text') {
                return (
                  <p key={index} className="whitespace-pre-wrap">
                    {part.text}
                  </p>
                );
              }
              if (part.type === 'tool-getTimezone') {
                return (
                  <p key={part.toolCallId}>
                    {part.state === 'output-available'
                      ? `Browser time zone: ${part.output}`
                      : 'Reading browser time zone…'}
                  </p>
                );
              }
              return null;
            })}
          </article>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={event => {
          event.preventDefault();
          if (busy || input.trim() === '') return;
          clearError();
          void sendMessage({ text: input });
          setInput('');
        }}
      >
        <label className="sr-only" htmlFor="websocket-message">
          Message
        </label>
        <input
          id="websocket-message"
          className="flex-1 border rounded p-2"
          placeholder="Say something…"
          value={input}
          disabled={busy}
          onChange={event => setInput(event.target.value)}
        />
        <button type="submit" disabled={busy || input.trim() === ''}>
          Send
        </button>
      </form>
    </main>
  );
}
