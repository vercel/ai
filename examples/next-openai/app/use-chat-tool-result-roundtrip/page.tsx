import { useChat } from 'ai/react';

export default function Chat() {
  const { messages, input, handleInputChange, handleSubmit } = useChat({
    api: '/api/use-chat-tool-result-roundtrip',
    experimental_maxAutomaticRoundtrips: 2,
  });

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      {messages
        .filter(m => m.content) // filter out empty messages
        .map(m => (
          <div key={m.id} className="whitespace-pre-wrap">
            <strong>{`${m.role}: `}</strong>
            {m.content}
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
