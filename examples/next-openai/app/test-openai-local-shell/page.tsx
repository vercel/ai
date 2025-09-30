'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import ChatInput from '@/component/chat-input';
import { OpenAILocalShellMessage } from '@/app/api/chat-openai-local-shell/route';
import LocalShellView from '@/component/openai-local-shell-view';

export default function TestOpenAIWebSearch() {
  const { status, sendMessage, messages } = useChat<OpenAILocalShellMessage>({
    transport: new DefaultChatTransport({
      api: '/api/chat-openai-local-shell',
    }),
  });

  return (
    <div className="flex flex-col py-24 mx-auto w-full max-w-md stretch">
      <h1 className="mb-2 text-xl font-bold">OpenAI Local Shell Test</h1>
      <h2 className="mb-4 border-b pb-2">
        Note: This example requires a Vercel OIDC Token to run the Code Shell
        with Vercel Sandbox
      </h2>

      {messages.map(message => (
        <div key={message.id} className="whitespace-pre-wrap">
          {message.role === 'user' ? 'User: ' : 'AI: '}
          <div className="space-y-4">
            {message.parts.map((part, index) => {
              switch (part.type) {
                case 'text':
                  return <div key={index}>{part.text}</div>;
                case 'tool-local_shell':
                  return <LocalShellView key={index} invocation={part} />;
              }
            })}
          </div>
        </div>
      ))}

      <ChatInput status={status} onSubmit={text => sendMessage({ text })} />
    </div>
  );
}
