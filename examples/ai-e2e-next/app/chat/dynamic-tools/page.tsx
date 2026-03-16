'use client';

import ChatInput from '@/components/chat-input';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { ToolsMessage } from '@/app/api/chat/dynamic-tools/route';

export default function Chat() {
  const { messages, sendMessage, status } = useChat<ToolsMessage>({
    transport: new DefaultChatTransport({ api: '/api/chat/dynamic-tools' }),
  });

  return (
    <div className="flex flex-col py-24 mx-auto w-full max-w-md stretch">
      <div className="mb-6 text-sm text-gray-600">
        Try asking for your location, then send a follow-up question after the
        tool result. Dynamic tool metadata is rendered below when available.
      </div>

      {messages?.map(message => (
        <div key={message.id} className="mb-4 whitespace-pre-wrap">
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

              case 'dynamic-tool': {
                switch (part.state) {
                  case 'input-streaming':
                  case 'input-available':
                  case 'output-available':
                    return (
                      <div
                        key={index}
                        className="my-3 rounded-lg border border-gray-200 bg-gray-50 p-4"
                      >
                        <div className="mb-2 text-sm font-semibold text-gray-900">
                          {part.title ?? part.toolName}
                        </div>
                        <div className="mb-2 text-xs uppercase tracking-wide text-gray-500">
                          State: {part.state}
                        </div>
                        {part._meta && (
                          <div className="mb-3">
                            <div className="mb-1 text-xs font-semibold text-gray-600">
                              Tool Metadata
                            </div>
                            <pre className="overflow-x-auto rounded bg-white p-2 text-xs">
                              {JSON.stringify(part._meta, null, 2)}
                            </pre>
                          </div>
                        )}
                        {'input' in part && part.input !== undefined && (
                          <div className="mb-3">
                            <div className="mb-1 text-xs font-semibold text-gray-600">
                              Input
                            </div>
                            <pre className="overflow-x-auto rounded bg-white p-2 text-xs">
                              {JSON.stringify(part.input, null, 2)}
                            </pre>
                          </div>
                        )}
                        {'output' in part && part.output !== undefined && (
                          <div>
                            <div className="mb-1 text-xs font-semibold text-gray-600">
                              Output
                            </div>
                            <pre className="overflow-x-auto rounded bg-white p-2 text-xs">
                              {JSON.stringify(part.output, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    );
                  case 'output-error':
                    return (
                      <div key={index} className="text-red-500">
                        Error: {part.errorText}
                      </div>
                    );
                }
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
                  case 'output-error':
                    return (
                      <div key={index} className="text-red-500">
                        Error: {part.errorText}
                      </div>
                    );
                }
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
