'use client';

import { MyUIMessage } from '@/util/chat-schema';
import { Chat } from '@ai-sdk/react';
import { useParams, usePathname } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { createChat } from './chat/[chatId]/chat';

type ActiveChatContextType = {
  chat?: Chat<MyUIMessage>;
  setChat: (value: Chat<MyUIMessage>) => void;
};

export const ActiveChatContext = createContext<ActiveChatContextType>({
  chat: undefined,
  setChat: () => {},
});

export function ActiveChatProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [chat, setChat] = useState<Chat<MyUIMessage>>(createChat());

  const handleSetChat = useCallback((value: Chat<MyUIMessage>) => {
    setChat(value);
  }, []);

  return (
    <ActiveChatContext.Provider value={{ chat, setChat: handleSetChat }}>
      {children}
    </ActiveChatContext.Provider>
  );
}

export function useActiveChat(chatData?: {
  id: string;
  messages: MyUIMessage[];
}) {
  const params = useParams();
  const pathname = usePathname();
  const { chat, setChat } = useContext(ActiveChatContext);

  const setOrCreateChat = useCallback(
    (id?: string, messages?: MyUIMessage[]) => {
      setChat(createChat(id, messages));
    },
    [setChat],
  );

  // Update on /chat/[chatId]
  useEffect(() => {
    if (
      params.chatId &&
      typeof params.chatId === 'string' &&
      chat?.id !== params.chatId
    ) {
      setOrCreateChat(params.chatId, chatData?.messages);
    }
  }, [params.chatId, chat, setOrCreateChat, chatData, setChat]);

  // New chat on /
  useEffect(() => {
    if (pathname === '/') {
      setOrCreateChat();
    }
  }, [pathname, setOrCreateChat]);

  return { chat, setOrCreateChat };
}
