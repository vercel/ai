import { ChatStatus, ChatStore, type ChatStoreEvent, type UIMessage } from 'ai';
import { useCallback } from 'react';

const EMPTY_ARRAY: UIMessage[] = [];

export function useChatStore({ store }: { store: ChatStore }) {
  const subscribe = useCallback(
    ({
      onStoreChange,
      eventType,
    }: {
      onStoreChange: () => void;
      eventType: ChatStoreEvent['type'];
    }) => {
      return store.subscribe({
        onChatChanged: event => {
          if (event.type === eventType) {
            onStoreChange();
          }
        },
      });
    },
    [store],
  );

  const getMessages = useCallback(
    (chatId: string) => {
      return store.getMessages(chatId) ?? EMPTY_ARRAY;
    },
    [store],
  );

  const getStatus = useCallback(
    (chatId: string) => {
      return store.getStatus(chatId) ?? 'ready';
    },
    [store],
  );

  const getError = useCallback(
    (chatId: string) => {
      return store.getError(chatId);
    },
    [store],
  );

  const setStatus = useCallback(
    ({
      status,
      error,
      chatId,
    }: {
      status: ChatStatus;
      error?: Error;
      chatId: string;
    }) => {
      store.setStatus({ id: chatId, status, error });
    },
    [store],
  );

  return { subscribe, getMessages, getStatus, getError, setStatus };
}
