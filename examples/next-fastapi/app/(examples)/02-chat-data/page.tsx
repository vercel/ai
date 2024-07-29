'use client';

import { useChat } from 'ai/react';
import { GeistMono } from 'geist/font/mono';

export default function Page() {
  const { messages, input, handleSubmit, handleInputChange, isLoading } =
    useChat({
      streamProtocol: 'data',
      maxToolRoundtrips: 2,
    });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col p-2 gap-2">
        {messages.map(message => (
          <div key={message.id} className="flex flex-row gap-2">
            <div className="w-24 text-zinc-500 flex-shrink-0">{`${message.role}: `}</div>

            <div className="flex flex-col gap-2">
              {message.content && <div>{message.content}</div>}

              <div className="flex flex-row gap-2">
                {message.toolInvocations?.map(toolInvocation => (
                  <pre
                    key={toolInvocation.toolCallId}
                    className={`${GeistMono.className} text-sm text-zinc-500 bg-zinc-100 p-3 rounded-lg`}
                  >
                    {`${toolInvocation.toolName}(${JSON.stringify(
                      toolInvocation.args,
                      null,
                      2,
                    )})`}
                  </pre>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-2 fixed bottom-0 p-2 w-full"
      >
        <input
          value={input}
          placeholder="Send message..."
          onChange={handleInputChange}
          className="bg-zinc-100 w-full p-2 rounded-md"
          disabled={isLoading}
        />
      </form>
    </div>
  );
}
