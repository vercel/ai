'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import ChatInput from '@/components/chat-input';
import { OpenAICodeInterpreterMessage } from '@/app/api/chat-openai-code-interpreter-annotation-download/route';
import CodeInterpreterView from '@/components/tool/openai-code-interpreter-view';

export default function TestOpenAIWebSearch() {
  const { status, sendMessage, messages } =
    useChat<OpenAICodeInterpreterMessage>({
      transport: new DefaultChatTransport({
        api: '/api/chat-openai-code-interpreter',
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
                return <div key={index}>{part.text}</div>;
              case 'tool-code_interpreter':
                return <CodeInterpreterView key={index} invocation={part} />;
            }
          })}
          {message.metadata?.downloadLinks &&
            message.metadata.downloadLinks.length > 0 && (
              <div className="mt-2 space-y-1">
                {message.metadata.downloadLinks.map((link, idx) => (
                  <a
                    key={idx}
                    href={link.url}
                    download={link.filename}
                    className="text-blue-600 hover:underline block"
                  >
                    📥 Download {link.filename}
                  </a>
                ))}
              </div>
            )}
        </div>
      ))}

      <ChatInput status={status} onSubmit={text => sendMessage({ text })} />
    </div>
  );
}
