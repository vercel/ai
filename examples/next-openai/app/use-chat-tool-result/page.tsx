'use client';

import { ToolInvocation } from 'ai';
import { useChat } from 'ai/react';

export default function Chat() {
  const { messages, input, handleInputChange, handleSubmit } = useChat({
    api: '/api/use-chat-tool-result',
  });

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      {messages.map(m => (
        <div key={m.id} className="whitespace-pre-wrap">
          <strong>{`${m.role}: `}</strong>
          {m.content}
          {m.toolInvocations?.map((toolInvocation: ToolInvocation) => {
            if (toolInvocation.toolName === 'weather') {
              const { city } = toolInvocation.args;
              return (
                <i key={toolInvocation.toolCallId} className="before:block">
                  {'result' in toolInvocation
                    ? `Weather in ${city}: ${toolInvocation.result}`
                    : `Calling weather tool for ${city}...`}
                </i>
              );
            }
          })}
          <br />
          <br />
        </div>
      ))}

      <form onSubmit={handleSubmit}>
        <input
          className="fixed bottom-0 w-full max-w-md p-2 mb-8 border border-gray-300 rounded shadow-xl"
          value={input}
          placeholder="Say something..."
          onChange={handleInputChange}
        />
      </form>
    </div>
  );
}
