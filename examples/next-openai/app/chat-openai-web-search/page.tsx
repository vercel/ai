'use client';

import { OpenAIInvalidToolcallReasoningMessage } from '@/app/api/chat-openai-invalid-toolcall-reasoning/route';
import { Response } from '@/components/ai-elements/response';
import ChatInput from '@/components/chat-input';
import { ReasoningView } from '@/components/reasoning-view';
import SourcesView from '@/components/sources-view';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

export default function TestOpenAIWebSearch() {
  const { error, status, sendMessage, messages, regenerate } =
    useChat<OpenAIInvalidToolcallReasoningMessage>({
      transport: new DefaultChatTransport({
        api: '/api/chat-openai-invalid-toolcall-reasoning',
      }),
    });

  return (
    <div className="flex flex-col py-24 mx-auto w-full max-w-md stretch">
      <h1 className="mb-4 text-xl font-bold">OpenAI Web Search</h1>

      {messages.map(message => (
        <div key={message.id} className="whitespace-pre-wrap">
          {message.role === 'user' ? 'User: ' : 'AI: '}
          {message.parts.map((part, index) => {
            switch (part.type) {
              case 'text': {
                return <Response key={index}>{part.text}</Response>;
              }
              case 'reasoning': {
                return <ReasoningView part={part} key={index} />;
              }
              case 'tool-web_search_preview': {
                switch (part.state) {
                  case 'input-streaming':
                  case 'input-available':
                    return (
                      <div
                        key={index}
                        className="flex flex-col gap-2 p-3 bg-blue-50 rounded border-l-4 border-blue-400 shadow"
                      >
                        <div className="flex items-center font-semibold text-blue-700">
                          <span className="inline-block mr-2 bg-blue-200 text-blue-900 rounded px-2 py-0.5 text-xs font-mono tracking-wider">
                            TOOL
                          </span>
                          Calling web_search_preview...
                        </div>
                        {part.input && (
                          <div className="pl-5 text-sm text-blue-800">
                            <span className="font-semibold">Query:</span>{' '}
                            <span className="inline-block bg-white border border-blue-100 rounded px-2 py-0.5 font-mono">
                              {JSON.stringify(part.input)}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  case 'output-error':
                    return (
                      <div
                        key={index}
                        className="flex flex-col gap-2 p-3 bg-red-50 rounded border-l-4 border-red-400 shadow"
                      >
                        <div className="flex items-center font-semibold text-red-700">
                          <span className="inline-block mr-2 bg-red-200 text-red-900 rounded px-2 py-0.5 text-xs font-mono tracking-wider">
                            ERROR
                          </span>
                          Tool execution failed
                        </div>
                        {part.input && (
                          <div className="pl-5 text-sm text-red-800">
                            <span className="font-semibold">Input:</span>{' '}
                            <span className="inline-block bg-white border border-red-100 rounded px-2 py-0.5 font-mono">
                              {JSON.stringify(part.input)}
                            </span>
                          </div>
                        )}
                        {part.errorText && (
                          <div className="pl-5 text-sm text-red-800">
                            <span className="font-semibold">Error:</span>{' '}
                            {part.errorText}
                          </div>
                        )}
                      </div>
                    );
                  case 'output-available':
                    return (
                      <div
                        key={index}
                        className="flex flex-col gap-2 p-3 bg-green-50 rounded border-l-4 border-green-400 shadow"
                      >
                        <div className="flex items-center font-semibold text-green-700">
                          <span className="inline-block mr-2 bg-green-200 text-green-900 rounded px-2 py-0.5 text-xs font-mono tracking-wider">
                            SUCCESS
                          </span>
                          Tool executed successfully
                        </div>
                        {part.input && (
                          <div className="pl-5 text-sm text-green-800">
                            <span className="font-semibold">Input:</span>{' '}
                            <span className="inline-block bg-white border border-green-100 rounded px-2 py-0.5 font-mono">
                              {JSON.stringify(part.input)}
                            </span>
                          </div>
                        )}
                        {part.output && (
                          <div className="pl-5 text-sm text-green-800">
                            <span className="font-semibold">Output:</span>{' '}
                            <span className="inline-block bg-white border border-green-100 rounded px-2 py-0.5 font-mono">
                              {JSON.stringify(part.output)}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                }
              }
            }
          })}

          <SourcesView
            sources={message.parts.filter(part => part.type === 'source-url')}
          />
        </div>
      ))}

      {error && (
        <div className="mt-4">
          <div className="text-red-500">An error occurred.</div>
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
