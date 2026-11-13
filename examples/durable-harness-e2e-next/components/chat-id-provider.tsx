'use client';

import { clearStoredAgentSession } from '@/lib/stored-agent-session';
import { clearStoredChatState } from '@/lib/stored-chat-state';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

type ChatIdContextValue = {
  chatId: string;
  resetChatId: () => void;
};

const ChatIdContext = createContext<ChatIdContextValue | null>(null);

export function useChatId(): ChatIdContextValue {
  const value = useContext(ChatIdContext);
  if (!value) {
    throw new Error('useChatId must be used within a ChatIdProvider');
  }
  return value;
}

/**
 * Provides the chat ID of the current browser tab, kept in session storage.
 * The chat ID doubles as the agent's session ID.
 */
export default function ChatIdProvider({
  storageKey,
  children,
}: {
  storageKey: string;
  children: ReactNode;
}) {
  const [chatId, setChatId] = useState<string | undefined>(undefined);

  useEffect(() => {
    const existing = window.sessionStorage.getItem(storageKey);
    if (existing) {
      setChatId(existing);
      return;
    }
    const fresh = crypto.randomUUID();
    window.sessionStorage.setItem(storageKey, fresh);
    setChatId(fresh);
  }, [storageKey]);

  if (chatId === undefined) {
    return null;
  }

  return (
    <ChatIdContext.Provider
      value={{
        chatId,
        resetChatId: () => {
          clearStoredAgentSession({ chatId });
          clearStoredChatState({ chatId });
          window.sessionStorage.removeItem(storageKey);
          window.location.reload();
        },
      }}
    >
      {children}
    </ChatIdContext.Provider>
  );
}
