'use client';

import { useChat } from '@ai-sdk/react';

export default function Page() {
  const { messages, input, handleInputChange, handleSubmit } = useChat({
    api: '/api/mcp-zapier',
  });

  return (
    <div className="flex flex-col items-center justify-end h-screen gap-4">
      <h1 className="text-xl p-4">My AI Assistant</h1>

      <div className="flex flex-col gap-2 p-4 mt-auto">
        {messages.map(message => (
          <div key={message.id}>
            <strong>{`${message.role}: `}</strong>
            {message.parts.map((part, index) => {
              switch (part.type) {
                case 'text':
                  return <span key={index}>{part.text}</span>;
                case 'tool-invocation': {
                  return (
                    <pre key={index}>
                      {JSON.stringify(part.toolInvocation, null, 2)}
                    </pre>
                  );
                }
              }
            })}
          </div>
        ))}
      </div>

      <div className="flex flex-col items-center gap-2 p-4">
        <textarea
          value={input}
          onChange={handleInputChange}
          placeholder="Start chatting"
          className="border-2 border-gray-300 rounded-md p-2 w-96 h-32"
        />
        <button
          className="bg-blue-500 text-white p-2 rounded-md w-full px-4"
          type="button"
          onClick={handleSubmit}
        >
          Send
        </button>
      </div>
    </div>
  );
}
