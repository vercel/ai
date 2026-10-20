'use client';

import type { OpenAIAdditionalToolsMessage } from '@/agent/openai/additional-tools-agent';
import { Response } from '@/components/ai-elements/response';
import ChatInput from '@/components/chat-input';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

export default function OpenAIAdditionalTools() {
  const { messages, sendMessage, status, error, regenerate } =
    useChat<OpenAIAdditionalToolsMessage>({
      transport: new DefaultChatTransport({
        api: '/api/chat/openai-additional-tools',
      }),
    });

  return (
    <div className="flex flex-col py-24 mx-auto w-full max-w-md stretch">
      <h1 className="mb-4 text-xl font-bold">OpenAI additional tools</h1>
      <p className="mb-4 text-sm text-gray-600">
        Search discovers a tool, then the assistant uses it to list issues. Ask
        again to reuse that tool in the same conversation. The issues are
        synthetic; no Linear account is needed.
      </p>
      <button
        type="button"
        className="mb-6 px-4 py-2 border rounded disabled:opacity-50"
        disabled={status !== 'ready'}
        onClick={() =>
          sendMessage({
            text:
              messages.length === 0
                ? 'Find Linear and list my issues.'
                : 'List my issues again.',
          })
        }
      >
        {messages.length === 0
          ? 'Find Linear and list issues'
          : 'List issues again'}
      </button>

      {messages.map(message => (
        <div key={message.id} className="mb-4 whitespace-pre-wrap">
          <strong>{message.role === 'user' ? 'You' : 'Assistant'}</strong>
          {message.parts.map((part, index) => {
            switch (part.type) {
              case 'text':
                return <Response key={index}>{part.text}</Response>;
              case 'tool-connection_search':
              case 'tool-linear__list_issues':
                return (
                  <div key={index} className="my-2 rounded border p-3 text-sm">
                    <strong>
                      {part.type === 'tool-connection_search'
                        ? 'Search connections'
                        : 'List Linear issues'}
                    </strong>
                    {part.state === 'output-available' ? (
                      <>
                        {part.type === 'tool-connection_search' && (
                          <p className="my-2">
                            Discovered tool: linear__list_issues
                          </p>
                        )}
                        <pre className="overflow-x-auto whitespace-pre-wrap">
                          {JSON.stringify(part.output, null, 2)}
                        </pre>
                      </>
                    ) : part.state === 'output-error' ? (
                      <p className="text-red-500">{part.errorText}</p>
                    ) : (
                      <p>Running…</p>
                    )}
                  </div>
                );
            }
          })}
        </div>
      ))}

      {error && (
        <div role="alert" className="mb-4 text-red-500">
          <p>{error.message}</p>
          <button
            type="button"
            className="underline"
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
