'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useState } from 'react';

export default function Page() {
  const [input, setInput] = useState('');
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat-rag-tool-sources',
    }),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    await sendMessage({ role: 'user', content: input });
    setInput('');
  };

  const isLoading = status === 'streaming' || status === 'submitted';

  return (
    <div className="flex flex-col gap-4 w-full max-w-3xl mx-auto py-8 px-4">
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">RAG with Tool Sources</h1>
        <p className="text-gray-600">
          This example demonstrates how tools can write sources directly to the
          stream. Ask questions about AI, ML, or neural networks to see sources
          appear as citations.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {messages.map((message: any) => {
          const sources = message.parts?.filter((p: any) => p.type === 'source-url') || [];

          return (
            <div
              key={message.id}
              className={`flex flex-col gap-2 p-4 rounded-lg ${
                message.role === 'user'
                  ? 'bg-blue-50 ml-auto max-w-[80%]'
                  : 'bg-gray-50 mr-auto max-w-[80%]'
              }`}
            >
              <div className="font-semibold text-sm text-gray-600">
                {message.role === 'user' ? 'You' : 'Assistant'}
              </div>

              {message.parts && message.parts.length > 0 ? (
                message.parts.map((part: any, index: number) => {
                  if (part.type === 'text') {
                    return (
                      <div key={index} className="whitespace-pre-wrap">
                        {part.text}
                      </div>
                    );
                  }
                  if (part.type === 'tool-call') {
                    return (
                      <div
                        key={index}
                        className="mt-2 p-3 bg-white rounded border border-gray-200"
                      >
                        <div className="text-xs font-semibold text-gray-500 mb-1">
                          🔧 Tool: {part.toolName}
                        </div>
                        <div className="text-xs text-gray-600">
                          Query: {part.args?.query || 'N/A'}
                        </div>
                      </div>
                    );
                  }
                  if (part.type === 'source-url') {
                    return null;
                  }
                  return null;
                })
              ) : (
                <div className="whitespace-pre-wrap">{message.content}</div>
              )}

              {sources.length > 0 && (
                <div className="mt-3 flex flex-col gap-2">
                  <div className="text-sm font-semibold text-gray-700">
                    📚 Sources:
                  </div>
                  {sources.map((source: any, index: number) => (
                    <a
                      key={source.id || index}
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-2 p-2 bg-white rounded border border-blue-200 hover:border-blue-400 transition-colors text-sm"
                    >
                      <span className="text-blue-600 font-medium">
                        [{index + 1}]
                      </span>
                      <div className="flex flex-col gap-1">
                        <span className="text-gray-800 font-medium">
                          {source.title || 'Untitled'}
                        </span>
                        <span className="text-gray-500 text-xs truncate max-w-md">
                          {source.url}
                        </span>
                      </div>
                      <span className="ml-auto text-blue-500">↗</span>
                    </a>
                  ))}
                </div>
              )}

              {message.role === 'assistant' &&
               message.parts?.some((p: any) => p.type === 'tool-result') &&
               sources.length === 0 && (
                <div className="mt-2 text-sm text-gray-500 italic">
                  No relevant sources found in knowledge base.
                </div>
              )}
            </div>
          );
        })}

        {isLoading && (
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <div className="animate-spin h-4 w-4 border-2 border-gray-300 border-t-blue-600 rounded-full" />
            Thinking...
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="mt-4">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about AI, ML, or neural networks..."
            className="flex-1 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </div>
        <div className="mt-2 text-sm text-gray-500">
          Try asking: "What is machine learning?" or "Explain neural networks"
        </div>
      </form>
    </div>
  );
}
