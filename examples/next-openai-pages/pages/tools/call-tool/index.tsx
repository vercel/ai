import { useChat } from '@ai-sdk/react';
import { defaultChatStoreOptions } from 'ai';

export default function Page() {
  const { messages, input, handleInputChange, handleSubmit } = useChat({
    chatStore: defaultChatStoreOptions({
      api: '/api/call-tool',
      maxSteps: 2,
    }),
  });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 p-2">
        {messages.map(message => (
          <div key={message.id} className="flex flex-row gap-2">
            <strong>{`${message.role}: `}</strong>

            {message.parts.map((part, index) => {
              switch (part.type) {
                case 'text':
                  return <div key={index}>{part.text}</div>;
                case 'tool-invocation': {
                  return (
                    <div key={index}>
                      {JSON.stringify(part.toolInvocation.args)}
                    </div>
                  );
                }
              }
            })}
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
