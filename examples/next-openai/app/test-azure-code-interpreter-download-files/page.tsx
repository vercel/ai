'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import ChatInput from '@/components/chat-input';
import { AzureCodeInterpreterMessage } from '@/app/api/chat-azure-code-interpreter-download-files/route';
import CodeInterpreterView from '@/components/tool/openai-code-interpreter-view';
import { MessageTextWithDownloadLink } from './message-text-with-download-link';
import { ContainerFileCitationDownloadButton } from './container-file-citation-download-button';

export default function TestOpenAIWebSearch() {
  const { status, sendMessage, messages } =
    useChat<AzureCodeInterpreterMessage>({
      transport: new DefaultChatTransport({
        api: '/api/chat-azure-code-interpreter-download-files',
      }),
    });

  return (
    <div className="flex flex-col py-24 mx-auto w-full max-w-md stretch">
      <h1 className="mb-4 text-xl font-bold">
        Azure OpenAI Code Interpreter Test
      </h1>

      {messages.map(message => (
        <div key={message.id} className="whitespace-pre-wrap">
          {message.role === 'user' ? 'User: ' : 'AI: '}
          {message.parts.map((part, index) => {
            switch (part.type) {
              case 'text':
                return <MessageTextWithDownloadLink key={index} part={part} />;
              case 'tool-code_interpreter':
                return <CodeInterpreterView key={index} invocation={part} />;
              case 'source-execution-file':
                return (
                  <div key={index} className="py-4">
                    <ContainerFileCitationDownloadButton
                      key={index}
                      part={part}
                    />
                  </div>
                );
            }
          })}
        </div>
      ))}
      <ChatInput status={status} onSubmit={text => sendMessage({ text })} />
    </div>
  );
}
