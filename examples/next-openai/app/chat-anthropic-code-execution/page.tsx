'use client';

import { AnthropicCodeExecutionMessage } from '@/agent/anthropic-code-execution-agent';
import { Response } from '@/components/ai-elements/response';
import ChatInput from '@/components/chat-input';
import AnthropicCodeExecutionView from '@/components/tool/anthropic-code-execution-view';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

export default function TestAnthropicCodeExecution() {
  const { error, status, sendMessage, messages, regenerate } =
    useChat<AnthropicCodeExecutionMessage>({
      transport: new DefaultChatTransport({
        api: '/api/chat-anthropic-code-execution',
      }),
    });

  console.log(structuredClone(messages));

  return (
    <div className="flex flex-col py-24 mx-auto w-full max-w-md stretch">
      <h1 className="mb-4 text-xl font-bold">Anthropic Code Execution Test</h1>

      {messages.map(message => (
        <div key={message.id} className="whitespace-pre-wrap">
          {message.role === 'user' ? 'User: ' : 'AI: '}
          {message.parts.map((part, index) => {
            switch (part.type) {
              case 'text': {
                return <Response key={index}>{part.text}</Response>;
              }
              case 'tool-code_execution': {
                return (
                  <AnthropicCodeExecutionView invocation={part} key={index} />
                );
              }
            }
          })}
        </div>
      ))}

      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="text-red-600 font-semibold mb-2">
            An error occurred:
          </div>
          <div className="text-red-700 text-sm mb-2 font-mono whitespace-pre-wrap break-all">
            {error.message}
          </div>
          {error.stack && (
            <details className="mt-2">
              <summary className="text-red-500 cursor-pointer text-sm">
                Show stack trace
              </summary>
              <pre className="text-xs text-red-400 mt-2 overflow-auto max-h-48 bg-red-100 p-2 rounded">
                {error.stack}
              </pre>
            </details>
          )}
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
