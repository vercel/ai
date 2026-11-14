'use client';

import { createAgentSession } from '@/lib/create-agent-session';
import {
  clearChatHarness,
  readChatHarness,
  readHarnessPreference,
  writeChatHarness,
  type HarnessName,
} from '@/lib/harness';
import {
  clearStoredAgentSession,
  writeStoredAgentSession,
} from '@/lib/stored-agent-session';
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
  harness: HarnessName;
  startNewSession: (options: { harness: HarnessName }) => Promise<void>;
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
 * Provides the chat ID of the current browser tab and the harness its
 * session runs on, both kept in session storage. The chat ID doubles as the
 * agent's session ID. A chat without a stored harness uses the harness
 * preference from local storage.
 */
export default function ChatIdProvider({
  storageKey,
  children,
}: {
  storageKey: string;
  children: ReactNode;
}) {
  const [chat, setChat] = useState<
    { chatId: string; harness: HarnessName } | undefined
  >(undefined);

  useEffect(() => {
    let chatId = window.sessionStorage.getItem(storageKey);
    if (!chatId) {
      chatId = crypto.randomUUID();
      window.sessionStorage.setItem(storageKey, chatId);
    }
    let harness = readChatHarness({ chatId });
    if (harness == null) {
      harness = readHarnessPreference();
      writeChatHarness({ chatId, harness });
    }
    setChat({ chatId, harness });
  }, [storageKey]);

  if (chat === undefined) {
    return null;
  }

  return (
    <ChatIdContext.Provider
      value={{
        ...chat,
        /*
         * Creates the new chat's agent session before switching to it, so
         * that a failure leaves the current chat untouched.
         */
        startNewSession: async ({ harness }) => {
          const chatId = crypto.randomUUID();
          const session = await createAgentSession({ harness, chatId });

          clearStoredAgentSession({ chatId: chat.chatId });
          clearStoredChatState({ chatId: chat.chatId });
          clearChatHarness({ chatId: chat.chatId });

          writeStoredAgentSession({ chatId, session });
          writeChatHarness({ chatId, harness });
          window.sessionStorage.setItem(storageKey, chatId);
          window.location.reload();
        },
      }}
    >
      {children}
    </ChatIdContext.Provider>
  );
}
