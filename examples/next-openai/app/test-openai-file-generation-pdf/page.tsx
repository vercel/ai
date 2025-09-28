'use client';

import ChatInput from '@/component/chat-input';
import FileSearchPDFView from '@/component/openai-file-search-pdf-view';
import FileSearchView from '@/component/openai-file-search-view';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { OpenAIFileGeneratePDFMessage } from '@/app/api/chat-openai-file-generation-pdf/route';

export default function TestOpenAIFileGenerationPDF() {
  const { status, sendMessage, messages } = useChat<OpenAIFileGeneratePDFMessage>({
    transport: new DefaultChatTransport({
      api: '/api/chat-openai-file-generation-pdf',
    }),
  });

  return (
    <div className="flex flex-col py-24 mx-auto w-full max-w-md stretch">
      <h1 className="mb-4 text-xl font-bold">OpenAI File Generation PDF Test</h1>

      {messages.map(message => (
        <div key={message.id} className="whitespace-pre-wrap">
          {message.role === 'user' ? 'User: ' : 'AI: '}
          {message.parts.map((part, index) => {
            switch (part.type) {
              case 'text':
                return <div key={index}>{part.text}</div>;
              case 'tool-file_search_pdf':
                return <FileSearchPDFView key={index} invocation={part} />;
              case 'tool-file_search':
                return <FileSearchView key={index} invocation={part} />;
            }
          })}
        </div>
      ))}

      <ChatInput status={status} onSubmit={text => sendMessage({ text })} />
    </div>
  );
}


