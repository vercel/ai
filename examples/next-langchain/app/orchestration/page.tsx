'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useState } from 'react';

export default function OrchestrationChat() {
  const [input, setInput] = useState('');
  const { messages, sendMessage } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/orchestration',
    }),
  });

  const getPartContentByTag = (message: any, tag: string): string => {
    const tagMapping = message.metadata?.tagMapping;
    if (!tagMapping || !tagMapping[tag]) return '';

    const partIds = tagMapping[tag];

    return partIds
      .map((partId: number) => {
        const part = message.parts[partId];
        return part && part.type === 'text' ? part.text : '';
      })
      .join('');
  };

  const aiMessages = messages.filter(m => m.role === 'assistant');

  return (
    <div className="flex h-screen">
      {/* Research Panel */}
      <div className="w-1/2 border-r border-gray-300">
        <div className="h-full flex flex-col">
          <div className="p-4 bg-blue-50 border-b border-blue-200">
            <h2 className="text-lg font-semibold text-blue-800">
              🔍 Research Stage
            </h2>
            <p className="text-sm text-blue-600">
              AI gathering and analyzing information
            </p>
          </div>
          <div className="flex-1 p-4 overflow-y-auto">
            {aiMessages.length > 0 ? (
              <div className="space-y-4">
                {aiMessages.map((message, index) => {
                  const researchContent = getPartContentByTag(
                    message,
                    'stage:research',
                  );
                  return (
                    <div
                      key={message.id}
                      className="border-b border-gray-200 pb-4 last:border-b-0"
                    >
                      <div className="text-xs text-gray-500 mb-2">
                        Research #{index + 1}
                      </div>
                      {researchContent ? (
                        <div className="whitespace-pre-wrap text-sm leading-relaxed">
                          {researchContent}
                        </div>
                      ) : (
                        <div className="text-gray-500 italic">
                          Research in progress...
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-gray-500 italic">
                Research will appear here...
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Chat Panel */}
      <div className="w-1/2 flex flex-col">
        <div className="p-4 bg-green-50 border-b border-green-200">
          <h2 className="text-lg font-semibold text-green-800">
            💬 Conversation
          </h2>
          <p className="text-sm text-green-600">
            Full chat with synthesized responses
          </p>
        </div>

        <div className="flex-1 p-4 overflow-y-auto">
          {messages.length > 0 ? (
            <div className="space-y-4">
              {messages.map(m => (
                <div key={m.id} className="mb-4">
                  {m.role === 'user' ? (
                    <>
                      <div className="font-semibold mb-2 text-gray-700">
                        🧑 You:
                      </div>
                      <div className="bg-gray-100 p-3 rounded-lg whitespace-pre-wrap">
                        {m.parts
                          .map((part: any) =>
                            part.type === 'text' ? part.text : '',
                          )
                          .join('')}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="font-semibold mb-2 text-gray-700">
                        🤖 AI:
                      </div>
                      <div className="bg-green-50 p-3 rounded-lg whitespace-pre-wrap border border-green-200">
                        {getPartContentByTag(m, 'stage:synthesis')}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-500 my-8">
              <p>Start a conversation to see AI orchestration in action!</p>
              <p className="text-sm mt-2">
                Example: "What are the benefits of renewable energy?"
              </p>
            </div>
          )}
        </div>

        {/* Input Form */}
        <div className="p-4 border-t border-gray-200">
          <form
            onSubmit={e => {
              e.preventDefault();
              sendMessage({ text: input });
              setInput('');
            }}
          >
            <div className="flex gap-2">
              <input
                className="flex-1 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={input}
                placeholder="Ask a question to see AI orchestration..."
                onChange={e => setInput(e.target.value)}
              />
              <button
                type="submit"
                className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
                disabled={!input.trim()}
              >
                Send
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
