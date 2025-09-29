'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
<<<<<<< HEAD
import { OpenAILocalShellMessage } from '@/app/api/chat-openai-local-shell/route';
import ChatInput from '@/components/chat-input';
import LocalShellView from '@/components/tool/openai-local-shell-view';
=======
import ChatInput from '@/component/chat-input';
import { OpenAILocalShellMessage } from '@/app/api/chat-openai-local-shell/route';
import LocalShellView from '@/component/openai-local-shell-view';
>>>>>>> 3997a4243 (feat(provider/openai): local shell tool (#9009))

export default function TestOpenAIWebSearch() {
  const { status, sendMessage, messages } = useChat<OpenAILocalShellMessage>({
    transport: new DefaultChatTransport({
      api: '/api/chat-openai-local-shell',
    }),
  });

  return (
    <div className="flex flex-col py-24 mx-auto w-full max-w-md stretch">
      <h1 className="mb-2 text-xl font-bold">OpenAI Local Shell Test</h1>
<<<<<<< HEAD
      <h2 className="pb-2 mb-4 border-b">
=======
      <h2 className="mb-4 border-b pb-2">
>>>>>>> 3997a4243 (feat(provider/openai): local shell tool (#9009))
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
