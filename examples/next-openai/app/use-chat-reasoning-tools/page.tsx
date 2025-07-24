'use client';

import ChatInput from '@/component/chat-input';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { ReasoningToolsMessage } from '../api/use-chat-reasoning-tools/route';

export default function Chat() {
  const { messages, sendMessage, addToolResult, status } =
    useChat<ReasoningToolsMessage>({
      transport: new DefaultChatTransport({
        api: '/api/use-chat-reasoning-tools',
      }),

      // run client-side tools that are automatically executed:
      async onToolCall({ toolCall }) {
        // artificial 2 second delay
        await new Promise(resolve => setTimeout(resolve, 2000));

        if (toolCall.toolName === 'getLocation') {
          const cities = [
            'New York',
            'Los Angeles',
            'Chicago',
            'San Francisco',
          ];
          addToolResult({
            tool: 'getLocation',
            toolCallId: toolCall.toolCallId,
            output: cities[Math.floor(Math.random() * cities.length)],
          });
        }
      },
    });

  console.log(structuredClone(messages));

  return (
    <div className="flex flex-col py-24 mx-auto w-full max-w-md stretch">
      {messages?.map(message => (
        <div key={message.id} className="whitespace-pre-wrap">
          <strong>{`${message.role}: `}</strong>
          {message.parts.map((part, index) => {
            if (part.type === 'text') {
              return (
                <pre
                  key={index}
                  className="overflow-x-auto max-w-full whitespace-pre-wrap break-words"
                >
                  {part.text}
                </pre>
              );
            }

            if (part.type === 'reasoning') {
              return (
                <pre
                  key={index}
                  className="overflow-x-auto mb-4 max-w-full italic text-gray-500 whitespace-pre-wrap break-words"
                >
                  {part.text}
                </pre>
              );
            }

            if (part.type === 'tool-askForConfirmation') {
              switch (part.state) {
                case 'input-available':
                  return (
                    <div key={part.toolCallId} className="text-gray-500">
                      {part.input.message}
                      <div className="flex gap-2">
                        <button
                          className="px-4 py-2 font-bold text-white bg-blue-500 rounded hover:bg-blue-700"
                          onClick={() =>
                            addToolResult({
                              tool: 'askForConfirmation',
                              toolCallId: part.toolCallId,
                              output: 'Yes, confirmed.',
                            })
                          }
                        >
                          Yes
                        </button>
                        <button
                          className="px-4 py-2 font-bold text-white bg-red-500 rounded hover:bg-red-700"
                          onClick={() =>
                            addToolResult({
                              tool: 'askForConfirmation',
                              toolCallId: part.toolCallId,
                              output: 'No, denied',
                            })
                          }
                        >
                          No
                        </button>
                      </div>
                    </div>
                  );
                case 'output-available':
                  return (
                    <div key={part.toolCallId} className="text-gray-500">
                      Location access allowed: {part.output}
                    </div>
                  );
              }
            }

            if (part.type === 'tool-getLocation') {
              switch (part.state) {
                case 'input-available':
                  return (
                    <div key={part.toolCallId} className="text-gray-500">
                      Getting location...
                    </div>
                  );
                case 'output-available':
                  return (
                    <div key={part.toolCallId} className="text-gray-500">
                      Location: {part.output}
                    </div>
                  );
              }
            }

            if (part.type === 'tool-getWeatherInformation') {
              switch (part.state) {
                // example of pre-rendering streaming tool calls:
                case 'input-streaming':
                  return (
                    <pre key={part.toolCallId}>
                      {JSON.stringify(part, null, 2)}
                    </pre>
                  );
                case 'input-available':
                  return (
                    <div key={part.toolCallId} className="text-gray-500">
                      Getting weather information for {part.input.city}...
                    </div>
                  );
                case 'output-available':
                  return (
                    <div key={part.toolCallId} className="text-gray-500">
                      Weather in {part.input.city}: {part.output}
                    </div>
                  );
              }
            }
          })}
        </div>
      ))}

      <ChatInput status={status} onSubmit={text => sendMessage({ text })} />
    </div>
  );
}
