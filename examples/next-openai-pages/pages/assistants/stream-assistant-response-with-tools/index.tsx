import { Message, useAssistant } from 'ai/react';

export default function Page() {
  const { status, messages, input, submitMessage, handleInputChange } =
    useAssistant({ api: '/api/assistant-tools' });

  return (
    <div className="flex flex-col gap-2">
      <div className="p-2">status: {status}</div>

      <div className="flex flex-col p-2 gap-2">
        {messages.map((message: Message) => (
          <div key={message.id} className="flex flex-row gap-2">
            <div className="w-24 text-zinc-500">{`${message.role}: `}</div>
            <div className="w-full">{message.content}</div>
          </div>
        ))}
      </div>

      <form onSubmit={submitMessage} className="fixed bottom-0 p-2 w-full">
        <input
          className="bg-zinc-100 w-full p-2"
          placeholder="Send message..."
          value={input}
          onChange={handleInputChange}
          disabled={status !== 'awaiting_message'}
        />
      </form>
    </div>
  );
}
