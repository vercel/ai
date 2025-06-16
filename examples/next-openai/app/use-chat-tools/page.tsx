'use client';

import ChatInput from '@/component/chat-input';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { UseChatToolsMessage } from '../api/use-chat-tools/route';

export default function Chat() {
  const { messages, sendMessage, addToolResult, status } =
    useChat<UseChatToolsMessage>({
      transport: new DefaultChatTransport({ api: '/api/use-chat-tools' }),
      maxSteps: 5,

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
          return cities[Math.floor(Math.random() * cities.length)];
        }
      },
    });

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      {messages?.map(message => (
        <div key={message.id} className="whitespace-pre-wrap">
          <strong>{`${message.role}: `}</strong>
          {message.parts.map((part, index) => {
            switch (part.type) {
              case 'text':
                return <div key={index}>{part.text}</div>;

              case 'step-start':
                return index > 0 ? (
                  <div key={index} className="text-gray-500">
                    <hr className="my-2 border-gray-300" />
                  </div>
                ) : null;

              case 'tool-askForConfirmation': {
                switch (part.state) {
                  case 'input-available':
                    return (
                      <div key={index} className="text-gray-500">
                        {part.input.message}
                        <div className="flex gap-2">
                          <button
                            className="px-4 py-2 font-bold text-white bg-blue-500 rounded hover:bg-blue-700"
                            onClick={() =>
                              addToolResult({
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
                      <div key={index} className="text-gray-500">
                        Location access allowed: {part.output}
                      </div>
                    );
                }
                break;
              }

              case 'tool-getLocation': {
                switch (part.state) {
                  case 'input-available':
                    return (
                      <div key={index} className="text-gray-500">
                        Getting location...
                      </div>
                    );
                  case 'output-available':
                    return (
                      <div key={index} className="text-gray-500">
                        Location: {part.output}
                      </div>
                    );
                }
                break;
              }

              case 'tool-getWeatherInformation': {
                switch (part.state) {
                  // example of pre-rendering streaming tool calls:
                  case 'input-streaming':
                    return (
                      <pre key={index}>
                        {JSON.stringify(part.input, null, 2)}
                      </pre>
                    );
                  case 'input-available':
                    return (
                      <div key={index} className="text-gray-500">
                        Getting weather information for {part.input.city}...
                      </div>
                    );
                  case 'output-available':
                    return (
                      <div key={index} className="text-gray-500">
                        Weather in {part.input.city}: {part.output}
                      </div>
                    );
                }
                break;
              }
            }
          })}
          <br />
        </div>
      ))}

      <ChatInput status={status} onSubmit={text => sendMessage({ text })} />
    </div>
  );
}
