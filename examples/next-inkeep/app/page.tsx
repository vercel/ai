'use client';

import { useChat } from 'ai/react';
import { useState } from 'react';

export default function Chat() {
  const [inkeepChatSessionId, setInkeepChatSessionId] = useState<
    string | undefined
  >(undefined);
  const inkeepIntegrationId = process.env.NEXT_PUBLIC_INKEEP_INTEGRATION_ID;

  if (!inkeepIntegrationId) {
    throw new Error(
      'NEXT_PUBLIC_INKEEP_INTEGRATION_ID is not defined in the environment variables.',
    );
  }

  const extraOptions = {
    data: {
      ...(inkeepChatSessionId ? { chat_session_id: inkeepChatSessionId } : {}),
      integration_id: inkeepIntegrationId,
    },
  };
  const { messages, input, handleInputChange, handleSubmit, data } = useChat();

  console.log(data);
  console.log(messages);

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      {messages.map(m => (
        <div key={m.id} className="whitespace-pre-wrap">
          {m.role === 'user' ? 'User: ' : 'AI: '}
          {m.content}
        </div>
      ))}

      <form
        onSubmit={e => {
          handleSubmit(e, extraOptions);
        }}
      >
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
