'use client';

import { useChat } from 'ai/react';
import { InkeepChatResultCustomData } from './api/chat/route';
import { useEffect } from 'react';

export default function Chat() {
  const { messages, input, handleInputChange, handleSubmit, data } = useChat();

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (data && data.length > 0) {
      const chatData = data[0] as InkeepChatResultCustomData;
      const options = {
        data: {
          ...(chatData && chatData.chat_session_id
            ? { chat_session_id: chatData.chat_session_id }
            : {}),
        },
      };
      handleSubmit(e, options);
    }
  };

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      {messages.map(m => (
        <div key={m.id} className="whitespace-pre-wrap">
          {m.role === 'user' ? 'User: ' : 'AI: '}
          {m.content}
        </div>
      ))}

      <form onSubmit={handleFormSubmit}>
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
