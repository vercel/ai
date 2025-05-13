import { ChatStore, type ChatStoreEvent } from 'ai';
import { useCallback, useSyncExternalStore } from 'react';

export function useChatStore<MESSAGE_METADATA>({
  store,
  chatId,
}: {
  store: ChatStore<MESSAGE_METADATA>;
  chatId: string;
}) {
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
    (
      options: Omit<
        Parameters<ChatStore<MESSAGE_METADATA>['addToolResult']>[0],
        'chatId'
      >,
    ) => store.addToolResult({ chatId, ...options }),
    [store, chatId],
  );

  const submitMessage = useCallback(
    (
      options: Omit<
        Parameters<ChatStore<MESSAGE_METADATA>['submitMessage']>[0],
        'chatId'
      >,
    ) => store.submitMessage({ chatId, ...options }),
    [store, chatId],
  );

  const resubmitLastUserMessage = useCallback(
    (
      options: Omit<
        Parameters<ChatStore<MESSAGE_METADATA>['resubmitLastUserMessage']>[0],
        'chatId'
      >,
    ) => store.resubmitLastUserMessage({ chatId, ...options }),
    [store, chatId],
  );

  const resumeStream = useCallback(
    (
      options: Omit<
        Parameters<ChatStore<MESSAGE_METADATA>['resumeStream']>[0],
        'chatId'
      >,
    ) => store.resumeStream({ chatId, ...options }),
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
    submitMessage,
    resubmitLastUserMessage,
    resumeStream,
  };
}
