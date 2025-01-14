'use client';

import { useChat } from 'ai/react';
import { useEffect, useState } from 'react';

export default function Chat({ chatId }: { chatId?: string | undefined } = {}) {
  const [ready, setReady] = useState(false);

  const {
    input,
    isLoading,
    handleInputChange,
    handleSubmit,
    messages,
    setMessages,
  } = useChat({
    api: '/api/use-chat-persistence',
    id: chatId,
    sendExtraMessageFields: true,
  });

  useEffect(() => {
    if (chatId) {
      const fetchInitialMessages = async () => {
        const response = await fetch(`/api/use-chat-persistence/${chatId}`);
        setMessages(await response.json());
        setReady(true);
      };
      fetchInitialMessages();
    } else {
      setReady(true);
    }
  }, [chatId, setMessages]);

  if (!ready) {
    return <div>Loading messages...</div>;
  }

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
          disabled={isLoading}
        />
      </form>
    </div>
  );
}
