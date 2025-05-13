import { ChatStatus, ChatStore, UIMessage, type ChatStoreEvent } from 'ai';
import { useCallback, useSyncExternalStore } from 'react';

export function useChatStore<MESSAGE_METADATA>({
  store,
  chatId,
}: {
  store: ChatStore<MESSAGE_METADATA>;
  chatId: string;
}): {
  messages: UIMessage<MESSAGE_METADATA>[];
  status: ChatStatus;
  error: Error | undefined;
  getLatestMessages: () => UIMessage<MESSAGE_METADATA>[];
  setStatus: (options: { status: ChatStatus; error?: Error }) => void;
} {
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
          if (event.chatId !== chatId || event.type !== eventType) {
            return;
          }

          onStoreChange();
        },
      });
    },
    [store, chatId],
  );

  const getLatestMessages = useCallback(() => {
    return store.getMessages(chatId);
  }, [store, chatId]);

  const error = useSyncExternalStore(
    callback =>
      subscribe({
        onStoreChange: callback,
        eventType: 'chat-status-changed',
      }),
    () => store.getError(chatId),
    () => store.getError(chatId),
  );

  const setStatus = useCallback(
    ({ status, error }: { status: ChatStatus; error?: Error }) => {
      store.setStatus({ id: chatId, status, error });
    },
    [store, chatId],
  );

  const status = useSyncExternalStore(
    callback =>
      subscribe({
        onStoreChange: callback,
        eventType: 'chat-status-changed',
      }),
    () => store.getStatus(chatId),
    () => store.getStatus(chatId),
  );

  const messages = useSyncExternalStore(
    callback => {
      return subscribe({
        onStoreChange: callback,
        eventType: 'chat-messages-changed',
      });
    },
    () => getLatestMessages(),
    () => getLatestMessages(),
  );

  return {
    messages,
    status,
    error,

    // TODO remove once pushed into chatstore
    getLatestMessages,

    setStatus,
  };
}
