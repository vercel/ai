'use client';

import type { OpenAIProgrammaticToolCallingMessage } from '@/agent/openai/programmatic-tool-calling-agent';
import { Response } from '@/components/ai-elements/response';
import ChatInput from '@/components/chat-input';
import OpenAIProgrammaticToolCallingView from '@/components/tool/openai-programmatic-tool-calling-view';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

export default function ChatOpenAIProgrammaticToolCalling() {
  const { error, status, sendMessage, messages, regenerate } =
    useChat<OpenAIProgrammaticToolCallingMessage>({
      transport: new DefaultChatTransport({
        api: '/api/chat/openai-programmatic-tool-calling',
      }),
    });

  return (
    <div className="flex flex-col py-24 mx-auto w-full max-w-md stretch">
      <h1 className="mb-4 text-xl font-bold">
        OpenAI Programmatic Tool Calling
      </h1>
      <p className="mb-4 text-sm text-gray-600">
        This example demonstrates how OpenAI can write hosted JavaScript that
        coordinates client-side tools and uses their structured outputs.
      </p>
      <p className="mb-4 text-sm text-gray-500">
        Try: &quot;Compare inventory with demand for sku_123 and tell me whether
        we can fulfill the order.&quot;
      </p>

      {messages.map(message => (
        <div key={message.id} className="whitespace-pre-wrap">
          {message.role === 'user' ? 'User: ' : 'AI: '}
          {message.parts.map((part, index) => {
            switch (part.type) {
              case 'text': {
                return <Response key={index}>{part.text}</Response>;
              }
              case 'tool-program': {
                return (
                  <OpenAIProgrammaticToolCallingView
                    key={index}
                    invocation={part}
                  />
                );
              }
              case 'tool-getInventory': {
                return (
                  <div
                    key={index}
                    className="mb-2 p-3 text-sm bg-blue-50 rounded border-l-4 border-blue-400"
                  >
                    {part.state === 'output-available'
                      ? `📦 ${part.output.sku}: ${part.output.availableUnits} units available`
                      : `📦 Checking inventory for ${part.input?.sku ?? 'SKU'}...`}
                  </div>
                );
              }
              case 'tool-getDemand': {
                return (
                  <div
                    key={index}
                    className="mb-2 p-3 text-sm bg-amber-50 rounded border-l-4 border-amber-400"
                  >
                    {part.state === 'output-available'
                      ? `🧾 ${part.output.sku}: ${part.output.requestedUnits} units requested`
                      : `🧾 Checking demand for ${part.input?.sku ?? 'SKU'}...`}
                  </div>
                );
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
