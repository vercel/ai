'use client';

import type { OpenAIQueueMessage } from '@/agent/openai/queue-agent';
import { Response } from '@/components/ai-elements/response';
import WeatherView from '@/components/tool/weather-view';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useState } from 'react';

function getText(message: OpenAIQueueMessage) {
  return message.parts
    .map(part => (part.type === 'text' ? part.text : ''))
    .join('');
}

export default function Queue() {
  const {
    status,
    error,
    messages,
    experimental_queuedMessages,
    sendMessage,
    experimental_removeQueuedMessage,
    experimental_sendQueuedMessageNow,
    stop,
  } = useChat<OpenAIQueueMessage>({
    transport: new DefaultChatTransport({ api: '/api/chat/queue' }),
    experimental_queue: true,
  });
  const [text, setText] = useState('');

  const isRunning = status === 'submitted' || status === 'streaming';

  return (
    <div className="flex flex-col py-24 mx-auto w-full max-w-md stretch">
      <h1 className="mb-4 text-xl font-bold">Message queue</h1>
      <p className="mb-6 text-sm text-gray-600">
        Ask for the weather in a few cities, then keep typing. Messages you send
        while the assistant is working wait in the queue and go out one at a
        time.
      </p>

      {messages.map(message => (
        <div key={message.id} className="mb-4 whitespace-pre-wrap">
          <strong>{message.role === 'user' ? 'User: ' : 'AI: '}</strong>

          {message.parts.map((part, index) => {
            switch (part.type) {
              case 'text':
                return <Response key={index}>{part.text}</Response>;
              case 'tool-weather':
                return <WeatherView key={index} invocation={part} />;
            }
          })}
        </div>
      ))}

      {error && (
        <div className="p-2 mb-2 text-sm text-red-700 bg-red-50 rounded border border-red-200">
          Something went wrong: {error.message}. The queue is paused.
        </div>
      )}

      {experimental_queuedMessages.length > 0 && (
        <div className="mt-2">
          <div className="mb-2 text-xs font-medium tracking-wide text-gray-500 uppercase">
            Queued ({experimental_queuedMessages.length})
            {!isRunning && ' · paused, send a message or send one now'}
          </div>
          <ul className="flex flex-col gap-2">
            {experimental_queuedMessages.map(message => (
              <li
                key={message.id}
                className="flex gap-2 items-center p-2 text-sm rounded border border-dashed border-gray-300"
              >
                <span className="flex-1">{getText(message)}</span>
                <button
                  type="button"
                  className="text-blue-600 hover:underline"
                  onClick={() => experimental_sendQueuedMessageNow(message.id)}
                >
                  Send now
                </button>
                <button
                  type="button"
                  className="text-gray-600 hover:underline"
                  aria-label={`Remove "${getText(message)}" from the queue`}
                  onClick={() => experimental_removeQueuedMessage(message.id)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form
        className="flex gap-2 mt-4"
        onSubmit={event => {
          event.preventDefault();
          if (text.trim() === '') return;
          sendMessage({ text });
          setText('');
        }}
      >
        <input
          className="flex-1 p-2 rounded border border-gray-300"
          placeholder={
            isRunning ? 'Queue a follow-up...' : 'Ask about the weather...'
          }
          value={text}
          onChange={event => setText(event.target.value)}
        />
        <button
          type="submit"
          className="px-3 py-2 rounded border border-gray-300"
        >
          {isRunning ? 'Queue' : 'Send'}
        </button>
        {isRunning && (
          <button
            type="button"
            className="px-3 py-2 rounded border border-gray-300"
            onClick={stop}
          >
            Stop
          </button>
        )}
      </form>
    </div>
  );
}
