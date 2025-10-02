'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import ChatInput from '@/component/chat-input';
import { OpenAICodeInterpreterMessage } from '@/app/api/chat-openai-code-interpreter/route';
import CodeInterpreterView from '@/component/openai-code-interpreter-view';
import {MessageTextWithDownloadLink} from './message-text-with-download-link';
import { ContainerFileCitationDownloadButton } from './container-file-citation-download-button';

export default function TestOpenAIWebSearch() {
  const { status, sendMessage, messages } =
    useChat<OpenAICodeInterpreterMessage>({
      transport: new DefaultChatTransport({
        api: '/api/chat-openai-code-interpreter-download-files',
      }),
    });

  return (
    <div className="flex flex-col py-24 mx-auto w-full max-w-md stretch">
      <h1 className="mb-4 text-xl font-bold">OpenAI Code Interpreter Test</h1>

      {messages.map(message => (
        <div key={message.id} className="whitespace-pre-wrap">
          {message.role === 'user' ? 'User: ' : 'AI: '}
          {message.parts.map((part, index) => {
            switch (part.type) {
              case 'text':
                return <MessageTextWithDownloadLink key={index} part={part} />;
              case 'tool-code_interpreter':
                return <CodeInterpreterView key={index} invocation={part} />;
              case 'file':
                return <ContainerFileCitationDownloadButton key={index} part={part} />
            }
          })}
        </div>
      ))}

      <ChatInput status={status} onSubmit={text => sendMessage({ text })} />
    </div>
  );
}
