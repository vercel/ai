'use client';

import { ChatState } from 'ai';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { store } from './store';

const ChatList = () => {
  const [chats, setChats] = useState<[string, ChatState][]>(store.getChats());

  useEffect(() => {
    const unsubscribe = store.subscribe({
      onChatChanged: () => {
        setChats(store.getChats());
      },
    });

    return unsubscribe;
  }, []);

  return (
    <div>
      <Link href={`/use-chat-v2`}>New Chat</Link>
      {chats.map(([id, chat]) => (
        <Link key={id} href={`/use-chat-v2/${id}`}>
          {id} ({chat.status})
        </Link>
      ))}
    </div>
  );
};

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <ChatList />
      {children}
    </div>
  );
}
