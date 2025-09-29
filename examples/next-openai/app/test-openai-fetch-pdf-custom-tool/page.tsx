'use client';

import ChatInput from '@/component/chat-input';
import FetchPDFView from '@/component/fetch-pdf-view';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { OpenAIFetchPDFMessage } from '@/app/api/chat-openai-fetch-pdf-custom-tool/route';

export default function TestOpenAIFileGenerationPDF() {
  const { status, sendMessage, messages } = useChat<OpenAIFetchPDFMessage>({
    transport: new DefaultChatTransport({
      api: '/api/chat-openai-fetch-pdf-custom-tool',
    }),
  });

  return (
    <div className="flex flex-col py-24 mx-auto w-full max-w-md stretch">
      <h1 className="mb-4 text-xl font-bold">
        OpenAI File Generation PDF Test
      </h1>

      {messages.map(message => (
        <div key={message.id} className="whitespace-pre-wrap">
          {message.role === 'user' ? 'User: ' : 'AI: '}
          {message.parts.map((part, index) => {
            switch (part.type) {
              case 'text':
                return <div key={index}>{part.text}</div>;
              case 'tool-fetchPdf':
                return <FetchPDFView key={index} invocation={part} />;
            }
          })}
        </div>
      ))}

      <ChatInput status={status} onSubmit={text => sendMessage({ text })} />
    </div>
  );
}
