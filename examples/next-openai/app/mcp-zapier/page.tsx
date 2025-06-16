'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, isToolUIPart } from 'ai';
import { useState } from 'react';

export default function Page() {
  const [input, setInput] = useState('');
  const { messages, sendMessage } = useChat({
    transport: new DefaultChatTransport({ api: '/api/mcp-zapier' }),
  });

  return (
    <div className="flex flex-col items-center justify-end h-screen gap-4">
      <h1 className="p-4 text-xl">My AI Assistant</h1>

      <div className="flex flex-col gap-2 p-4 mt-auto">
        {messages.map(message => (
          <div key={message.id}>
            <strong>{`${message.role}: `}</strong>
            {message.parts.map((part, index) => {
              if (part.type === 'text') {
                return <span key={index}>{part.text}</span>;
              } else if (isToolUIPart(part)) {
                return <pre key={index}>{JSON.stringify(part, null, 2)}</pre>;
              }
            })}
          </div>
        ))}
      </div>

      <div className="flex flex-col items-center gap-2 p-4">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Start chatting"
          className="h-32 p-2 border-2 border-gray-300 rounded-md w-96"
        />
        <button
          className="w-full p-2 px-4 text-white bg-blue-500 rounded-md"
          type="button"
          onClick={() => sendMessage({ text: input })}
        >
          Send
        </button>
      </div>
    </div>
  );
}
