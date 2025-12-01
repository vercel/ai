'use client';

import { AnthropicToolsAgentMessage } from '@/agent/anthropic-tools-agent';
import { Response } from '@/components/ai-elements/response';
import ChatInput from '@/components/chat-input';
import WeatherView from '@/components/tool/weather-view';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

const initialMessages = [
  {
    id: crypto.randomUUID(),
    role: 'user',
    parts: [
      {
        type: 'text',
        text: "hey what's the weather in paris?",
      },
    ],
  },
  {
    id: crypto.randomUUID(),
    role: 'assistant',
    parts: [
      {
        type: 'tool-weather',
        state: 'output-available',
        toolCallId: 'toolu_0194MoeeJGJDTGfNPZB7Ciay',
        input: {
          city: 'paris',
        },
        output: {
          state: 'ready',
          temperature: 72,
          weather: 'cloudy',
        },
      },
      {
        type: 'text',
        text: 'The weather in Paris is currently **cloudy** with a temperature of **72°F** (about 22°C).',
        state: 'done',
      },
      {
        type: 'tool-weather',
        state: 'output-available',
        toolCallId: 'toolu_0194MoeeJGJDTGfNPZB7Ciay',
        input: {
          city: 'london',
        },
        output: {
          state: 'ready',
          temperature: 72,
          weather: 'cloudy',
        },
      },
      {
        type: 'text',
        text: 'The weather in London is currently **cloudy** with a temperature of **72°F** (about 22°C).',
        state: 'done',
      },
    ],
  },
] satisfies AnthropicToolsAgentMessage[];

export default function TestAnthropicCodeExecution() {
  const { error, status, sendMessage, messages, regenerate } =
    useChat<AnthropicToolsAgentMessage>({
      transport: new DefaultChatTransport({
        api: '/api/chat-anthropic-tools',
      }),
      messages: initialMessages,
    });

  return (
    <div className="flex flex-col py-24 mx-auto w-full max-w-md stretch">
      <h1 className="mb-4 text-xl font-bold">Anthropic Tools</h1>

      {messages.map(message => (
        <div key={message.id} className="whitespace-pre-wrap">
          {message.role === 'user' ? 'User: ' : 'AI: '}
          {message.parts.map((part, index) => {
            switch (part.type) {
              case 'text': {
                return <Response key={index}>{part.text}</Response>;
              }
              case 'tool-weather': {
                return <WeatherView invocation={part} key={index} />;
              }
            }
          })}
        </div>
      ))}

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
