'use client';

import { useChat } from '@ai-sdk/react';

export default function Chat() {
  const { messages, input, handleInputChange, handleSubmit, addToolResult } =
    useChat({
      api: '/api/use-chat-tools',
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
              case 'tool-invocation': {
                switch (part.toolInvocation.toolName) {
                  case 'askForConfirmation': {
                    switch (part.toolInvocation.state) {
                      case 'call':
                        return (
                          <div key={index} className="text-gray-500">
                            {part.toolInvocation.args.message}
                            <div className="flex gap-2">
                              <button
                                className="px-4 py-2 font-bold text-white bg-blue-500 rounded hover:bg-blue-700"
                                onClick={() =>
                                  addToolResult({
                                    toolCallId: part.toolInvocation.toolCallId,
                                    result: 'Yes, confirmed.',
                                  })
                                }
                              >
                                Yes
                              </button>
                              <button
                                className="px-4 py-2 font-bold text-white bg-red-500 rounded hover:bg-red-700"
                                onClick={() =>
                                  addToolResult({
                                    toolCallId: part.toolInvocation.toolCallId,
                                    result: 'No, denied',
                                  })
                                }
                              >
                                No
                              </button>
                            </div>
                          </div>
                        );
                      case 'result':
                        return (
                          <div key={index} className="text-gray-500">
                            Location access allowed:{' '}
                            {part.toolInvocation.result}
                          </div>
                        );
                    }
                    break;
                  }

                  case 'getLocation': {
                    switch (part.toolInvocation.state) {
                      case 'call':
                        return (
                          <div key={index} className="text-gray-500">
                            Getting location...
                          </div>
                        );
                      case 'result':
                        return (
                          <div key={index} className="text-gray-500">
                            Location: {part.toolInvocation.result}
                          </div>
                        );
                    }
                    break;
                  }

                  case 'getWeatherInformation': {
                    switch (part.toolInvocation.state) {
                      // example of pre-rendering streaming tool calls:
                      case 'partial-call':
                        return (
                          <pre key={index}>
                            {JSON.stringify(part.toolInvocation, null, 2)}
                          </pre>
                        );
                      case 'call':
                        return (
                          <div key={index} className="text-gray-500">
                            Getting weather information for{' '}
                            {part.toolInvocation.args.city}...
                          </div>
                        );
                      case 'result':
                        return (
                          <div key={index} className="text-gray-500">
                            Weather in {part.toolInvocation.args.city}:{' '}
                            {part.toolInvocation.result}
                          </div>
                        );
                    }
                    break;
                  }
                }
              }
            }
          })}
          <br />
        </div>
      ))}

      <form onSubmit={handleSubmit}>
        <input
          className="fixed bottom-0 w-full max-w-md p-2 mb-8 border border-gray-300 rounded shadow-xl"
          value={input}
          placeholder="Say something..."
          onChange={handleInputChange}
        />
      </form>
    </div>
  );
}
