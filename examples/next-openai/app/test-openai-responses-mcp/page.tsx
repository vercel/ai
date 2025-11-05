'use client';

import ChatInput from '@/components/chat-input';
import DynamicToolView from '@/components/tool/dynamic-tool-view';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { OpenAIResponsesMCPMessage } from '../api/chat-openai-responses-mcp/route';

export default function TestOpenAIResponsesMCP() {
  const { status, sendMessage, messages } = useChat<OpenAIResponsesMCPMessage>({
    transport: new DefaultChatTransport({
      api: '/api/chat-openai-responses-mcp',
    }),
  });

  return (
    <div className="flex flex-col py-24 mx-auto w-full max-w-md stretch">
      <h1 className="mb-4 text-xl font-bold">OpenAI Responses MCP Tool Test</h1>

      {messages.map(message => (
        <div key={message.id} className="whitespace-pre-wrap">
          {message.role === 'user' ? 'User: ' : 'AI: '}
          {message.parts.map((part, index) => {
            switch (part.type) {
              case 'text':
                return <div key={index}>{part.text}</div>;
              case 'dynamic-tool':
                return <DynamicToolView key={index} invocation={part} />;
            }
          })}
        </div>
      ))}

      <ChatInput status={status} onSubmit={text => sendMessage({ text })} />
    </div>
  );
}
