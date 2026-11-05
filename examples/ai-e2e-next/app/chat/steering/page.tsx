'use client';

import type { OpenAISteeringMessage } from '@/agent/openai/steering-agent';
import type { SteerRequest } from '@/app/api/chat/steering/steer/route';
import { Response } from '@/components/ai-elements/response';
import WeatherView from '@/components/tool/weather-view';
import { useChat } from '@ai-sdk/react';
import {
  DefaultChatTransport,
  generateId,
  type Experimental_SteeringOutcome,
} from 'ai';
import { useState } from 'react';

type SentMessage = {
  id: string;
  text: string;
  mode: SteerRequest['mode'];
  status: 'waiting' | 'delivered' | 'not-delivered';
  reason?: string;
};

export default function Steering() {
  const { id, status, sendMessage, messages } = useChat<OpenAISteeringMessage>({
    transport: new DefaultChatTransport({ api: '/api/chat/steering' }),
  });
  const [text, setText] = useState('');
  const [sentMessages, setSentMessages] = useState<Array<SentMessage>>([]);

  const isRunning = status === 'submitted' || status === 'streaming';

  async function steer(mode: SteerRequest['mode']) {
    const message: SentMessage = {
      id: generateId(),
      text,
      mode,
      status: 'waiting',
    };
    setSentMessages(current => [...current, message]);
    setText('');

    const response = await fetch('/api/chat/steering/steer', {
      method: 'POST',
      body: JSON.stringify({
        chatId: id,
        id: message.id,
        text: message.text,
        mode,
      } satisfies SteerRequest),
    });

    const outcome: Experimental_SteeringOutcome | undefined = response.ok
      ? await response.json()
      : undefined;

    const update: Partial<SentMessage> =
      outcome?.type === 'delivered'
        ? { status: 'delivered' }
        : { status: 'not-delivered', reason: outcome?.reason ?? 'finished' };

    setSentMessages(current =>
      current.map(sent =>
        sent.id === message.id ? { ...sent, ...update } : sent,
      ),
    );
  }

  return (
    <div className="flex flex-col py-24 mx-auto w-full max-w-md stretch">
      <h1 className="mb-4 text-xl font-bold">Steering</h1>
      <p className="mb-6 text-sm text-gray-600">
        Ask for the weather in a few cities. While the assistant is working,
        steer it with a correction or queue a follow-up for when it is done.
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
              case 'steering-message':
                return (
                  <div
                    key={index}
                    className="p-2 my-2 ml-8 bg-blue-50 rounded border border-blue-200"
                  >
                    <strong>User: </strong>
                    {part.parts.map(content =>
                      content.type === 'text' ? content.text : null,
                    )}
                  </div>
                );
            }
          })}
        </div>
      ))}

      {sentMessages
        .filter(sent => sent.status !== 'delivered')
        .map(sent => (
          <div key={sent.id} className="mb-2 text-sm text-gray-500">
            {sent.status === 'waiting'
              ? `${sent.mode === 'queue' ? 'Queued' : 'Waiting for the next step'}: ${sent.text}`
              : `Not delivered (${sent.reason}): ${sent.text}`}
          </div>
        ))}

      <form
        className="flex gap-2 mt-4"
        onSubmit={event => {
          event.preventDefault();
          if (text.trim() === '') return;

          if (isRunning) {
            steer('steer');
          } else {
            sendMessage({ text });
            setText('');
          }
        }}
      >
        <input
          className="flex-1 p-2 rounded border border-gray-300"
          placeholder={
            isRunning ? 'Steer or queue a message...' : 'Say something...'
          }
          value={text}
          onChange={event => setText(event.target.value)}
        />
        {isRunning ? (
          <>
            <button
              type="submit"
              className="px-3 py-2 rounded border border-gray-300"
            >
              Steer
            </button>
            <button
              type="button"
              className="px-3 py-2 rounded border border-gray-300"
              onClick={() => {
                if (text.trim() !== '') steer('queue');
              }}
            >
              Queue
            </button>
          </>
        ) : (
          <button
            type="submit"
            className="px-3 py-2 rounded border border-gray-300"
          >
            Send
          </button>
        )}
      </form>
    </div>
  );
}
