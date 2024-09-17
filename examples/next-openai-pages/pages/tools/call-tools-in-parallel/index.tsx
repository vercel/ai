import { useChat } from 'ai/react';

export default function Page() {
  const { messages, input, handleInputChange, handleSubmit } = useChat({
    api: '/api/call-tools-in-parallel',
    maxSteps: 2,
  });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 p-2">
        {messages.map(message => (
          <div key={message.id} className="flex flex-row gap-2">
            <div className="w-24 text-zinc-500">{`${
              message.toolInvocations ? 'tool' : message.role
            }: `}</div>
            <div className="flex flex-col w-full gap-2">
              {message.toolInvocations
                ? message.toolInvocations.map(tool => (
                    <div key={tool.toolCallId}>{`${
                      tool.toolName
                    }(${JSON.stringify(tool.args)})`}</div>
                  ))
                : message.content}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="fixed bottom-0 w-full p-2">
        <input
          value={input}
          placeholder="Send message..."
          onChange={handleInputChange}
          className="w-full p-2 bg-zinc-100"
        />
      </form>
    </div>
  );
}
