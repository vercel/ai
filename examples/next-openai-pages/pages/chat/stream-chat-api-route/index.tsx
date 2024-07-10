import { useChat } from 'ai/react';

export default function Chat() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } =
    useChat({
      api: '/api/chat-api-route',
    });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col p-2 gap-2">
        {messages.map(message => (
          <div key={message.id} className="flex flex-row gap-2">
            <div className="w-24 text-zinc-500">{`${message.role}: `}</div>
            <div className="w-full">{message.content}</div>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="fixed bottom-0 p-2 w-full">
        <input
          value={input}
          placeholder="Send message..."
          onChange={handleInputChange}
          className="bg-zinc-100 w-full p-2"
          disabled={isLoading}
        />
      </form>
    </div>
  );
}
