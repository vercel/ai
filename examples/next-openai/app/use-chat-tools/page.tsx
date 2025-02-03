'use client';

import { useChat } from 'ai/react';

export default function Chat() {
  const { messages, input, handleInputChange, handleSubmit, addToolResult } =
    useChat({
      api: '/api/use-chat-tools',
      maxSteps: 5,

      // run client-side tools that are automatically executed:
      async onToolCall({ toolCall }) {
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
          {message.parts.map(part => {
            switch (part.type) {
              case 'text':
                return part.text;
              case 'tool-invocation': {
                const invocation = part.toolInvocation;
                const callId = invocation.toolCallId;

                switch (invocation.toolName) {
                  case 'askForConfirmation': {
                    switch (invocation.state) {
                      case 'partial-call':
                        return undefined;
                      case 'call':
                        return (
                          <div key={callId} className="text-gray-500">
                            {invocation.args.message}
                            <div className="flex gap-2">
                              <button
                                className="px-4 py-2 font-bold text-white bg-blue-500 rounded hover:bg-blue-700"
                                onClick={() =>
                                  addToolResult({
                                    toolCallId: callId,
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
                                    toolCallId: callId,
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
                          <div key={callId} className="text-gray-500">
                            Location access allowed: {invocation.result}
                          </div>
                        );
                    }
                  }

                  case 'getLocation': {
                    switch (invocation.state) {
                      case 'partial-call':
                        return undefined;
                      case 'call':
                        return (
                          <div key={callId} className="text-gray-500">
                            Getting location...
                          </div>
                        );
                      case 'result':
                        return (
                          <div key={callId} className="text-gray-500">
                            Location: {invocation.result}
                          </div>
                        );
                    }
                  }

                  case 'getWeatherInformation': {
                    switch (invocation.state) {
                      // example of pre-rendering streaming tool calls:
                      case 'partial-call':
                        return (
                          <pre key={callId}>
                            {JSON.stringify(invocation, null, 2)}
                          </pre>
                        );
                      case 'call':
                        return (
                          <div key={callId} className="text-gray-500">
                            Getting weather information for{' '}
                            {invocation.args.city}...
                          </div>
                        );
                      case 'result':
                        return (
                          <div key={callId} className="text-gray-500">
                            Weather in {invocation.args.city}:{' '}
                            {invocation.result}
                          </div>
                        );
                    }
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
