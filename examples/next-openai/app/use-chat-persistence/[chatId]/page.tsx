'use client';

import { useChat } from 'ai/react';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function Chat() {
  const { chatId } = useParams();

  const {
    input,
    isLoading,
    handleInputChange,
    handleSubmit,
    messages,
    setMessages,
  } = useChat({
    api: '/api/use-chat-persistence',
    id: chatId as string,
    sendExtraMessageFields: true,
  });

  useEffect(() => {
    // Fetch initial messages when component mounts
    const fetchInitialMessages = async () => {
      try {
        const response = await fetch(`/api/use-chat-persistence/${chatId}`);
        const initialMessages = await response.json();
        setMessages(initialMessages);
      } catch (error) {
        console.error('Failed to fetch initial messages:', error);
      }
    };

    fetchInitialMessages();
  }, [chatId, setMessages]);

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
