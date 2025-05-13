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
  addToolResult: ({
    toolCallId,
    result,
  }: {
    toolCallId: string;
    result: unknown;
  }) => void;
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

  const addToolResult = useCallback(
    ({ toolCallId, result }: { toolCallId: string; result: unknown }) => {
      store.addToolResult({ chatId, toolCallId, result });
    },
    [store, chatId],
  );

  const error = useSyncExternalStore(
    callback =>
      subscribe({
        onStoreChange: callback,
        eventType: 'chat-status-changed',
      }),
    () => store.getError(chatId),
    () => store.getError(chatId),
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
    () => store.getMessages(chatId),
    () => store.getMessages(chatId),
  );

  return {
    messages,
    status,
    error,
    addToolResult,
  };
}
