'use client';

import { useChat } from '@ai-sdk/react';
import ChatInput from '@component/chat-input';
import { DefaultChatTransport } from 'ai';
import { StreamingToolCallsMessage } from '../api/use-chat-streaming-tool-calls/route';

export default function Chat() {
  const { messages, status, sendMessage } = useChat<StreamingToolCallsMessage>({
    transport: new DefaultChatTransport({
      api: '/api/use-chat-streaming-tool-calls',
    }),
    maxSteps: 5,

    // run client-side tools that are automatically executed:
    async onToolCall({ toolCall }) {
      if (toolCall.toolName === 'showWeatherInformation') {
        // display tool. add tool result that informs the llm that the tool was executed.
        return 'Weather information was shown to the user.';
      }
    },
  });

  // used to only render the role when it changes:
  let lastRole: string | undefined = undefined;

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      {messages?.map(m => {
        const isNewRole = m.role !== lastRole;
        lastRole = m.role;

        return (
          <div key={m.id} className="whitespace-pre-wrap">
            {isNewRole && <strong>{`${m.role}: `}</strong>}
            {m.parts.map(part => {
              if (part.type === 'text') {
                return part.text;
              }

              if (part.type === 'tool-showWeatherInformation') {
                return (
                  <div
                    key={part.toolCallId}
                    className="p-4 my-2 text-gray-500 border border-gray-300 rounded"
                  >
                    <h4 className="mb-2">{part.input.city ?? ''}</h4>
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        {part.input.weather && <b>{part.input.weather}</b>}
                        {part.input.temperature && (
                          <b>{part.input.temperature} &deg;C</b>
                        )}
                      </div>
                      {part.input.typicalWeather && (
                        <div>{part.input.typicalWeather}</div>
                      )}
                    </div>
                  </div>
                );
              }
            })}
          </div>
        );
      })}

      <ChatInput status={status} onSubmit={text => sendMessage({ text })} />
    </div>
  );
}
