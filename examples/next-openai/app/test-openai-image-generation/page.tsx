'use client';

import { OpenAIImageGenerationMessage } from '@/app/api/chat-openai-image-generation/route';
import ChatInput from '@/component/chat-input';
import ImageGenerationView from '@/component/openai-image-generation-view';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

export default function TestOpenAIWebSearch() {
  const { status, sendMessage, messages } =
    useChat<OpenAIImageGenerationMessage>({
      transport: new DefaultChatTransport({
        api: '/api/chat-openai-image-generation',
      }),
    });

  return (
    <div className="flex flex-col py-24 mx-auto w-full max-w-md stretch">
      <h1 className="mb-4 text-xl font-bold">OpenAI Image Generation Test</h1>

      {messages.map(message => (
        <div key={message.id} className="whitespace-pre-wrap">
          {message.role === 'user' ? 'User: ' : 'AI: '}
          {message.parts.map((part, index) => {
            switch (part.type) {
              case 'text':
                return <div key={index}>{part.text}</div>;
              case 'tool-image_generation':
                return <ImageGenerationView key={index} invocation={part} />;
            }
          })}
        </div>
      ))}

      <ChatInput status={status} onSubmit={text => sendMessage({ text })} />
    </div>
  );
}
