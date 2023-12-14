'use client';

import { useChat } from 'ai/react';
import { InkeepChatResultCustomData } from './api/chat/route';
import { useEffect, useState } from 'react';

export default function Chat() {
  /**
   * put in query params e.g. ?chat_session_id=123
   * or path params like /chat/123 depending on your use case
   */
  const [chatSessionId, setChatSessionId] = useState<string | undefined>(
    undefined,
  );

  const { messages, input, handleInputChange, handleSubmit, data } = useChat({
    body: {
      chat_session_id: chatSessionId,
    },
  });

  // when data with chat_session_id is received, update the chatSessionId
  useEffect(() => {
    if (data && data.length > 0) {
      const chatData = data[data.length - 1] as { [key: string]: unknown };
      if (chatData && 'chat_session_id' in chatData) {
        const newChatSessionId = chatData['chat_session_id'] as string;
        setChatSessionId(newChatSessionId);
      }
    }
  }, [data?.length]);

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      {messages.map(m => (
        <div key={m.id} className="whitespace-pre-wrap">
          {m.role === 'user' ? 'User: ' : 'AI: '}
          {m.content}
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
