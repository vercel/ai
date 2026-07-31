'use client';

import type { CodeModeMessage } from '@/agent/code-mode/code-mode-agent';
import { Response } from '@/components/ai-elements/response';
import ChatInput from '@/components/chat-input';
import CodeModeView from '@/components/tool/code-mode-view';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

export default function ChatCodeMode() {
  const { error, status, sendMessage, messages, regenerate } =
    useChat<CodeModeMessage>({
      transport: new DefaultChatTransport({
        api: '/api/chat/code-mode',
      }),
    });

  return (
    <div className="flex flex-col py-24 mx-auto w-full max-w-md stretch">
      <h1 className="mb-4 text-xl font-bold">Code Mode</h1>
      <p className="mb-4 text-sm text-gray-600">
        This example demonstrates how a model can write sandboxed TypeScript
        that coordinates tools and uses their structured outputs in a multi-turn
        conversation.
      </p>
      <p className="mb-4 text-sm text-gray-500">
        Try: &quot;Compare inventory and demand for product sku_123.&quot; Then
        ask: &quot;What if demand increases by 15 units?&quot;
      </p>

      {messages.map(message => (
        <div key={message.id} className="whitespace-pre-wrap">
          {message.role === 'user' ? 'User: ' : 'AI: '}
          {message.parts.map((part, index) => {
            switch (part.type) {
              case 'text': {
                return <Response key={index}>{part.text}</Response>;
              }
              case 'tool-codeMode': {
                return <CodeModeView key={index} invocation={part} />;
              }
            }
          })}
        </div>
      ))}

      {error && (
        <div className="mt-4">
          <div className="text-red-500">An error occurred: {error.message}</div>
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
