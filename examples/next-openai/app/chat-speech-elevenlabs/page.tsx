'use client';

import { Message } from 'ai';
import { useChat } from 'ai/react';

// Generate a map of message role to text color
const roleToColorMap: Record<Message['role'], string> = {
  system: 'red',
  user: 'black',
  function: 'blue',
  tool: 'purple',
  assistant: 'green',
  data: 'orange',
};

export default function Chat() {
  const { messages, input, handleInputChange, handleSubmit, speechUrl } =
    useChat({
      api: '/api/chat-speech-elevenlabs',
    });

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      {messages.map((m: Message) => (
        <div
          key={m.id}
          className="whitespace-pre-wrap"
          style={{ color: roleToColorMap[m.role] }}
        >
          <strong>{`${m.role}: `}</strong>
          {m.content || JSON.stringify(m.function_call)}
          <br />
          <br />
        </div>
      ))}

      <div className="flex justify-center mt-4">
        {speechUrl != null && (
          <audio
            controls
            controlsList="nodownload nofullscreen noremoteplayback"
            autoPlay={true}
            src={speechUrl}
          />
        )}
      </div>

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
