import {
  type AbstractChat,
  type ChatInit,
  type ChatTransport,
  type CreateUIMessage,
  type UIMessage,
  DefaultChatTransport,
} from 'ai';
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { Chat } from './chat.react';

export type { CreateUIMessage, UIMessage };

export type UseChatHelpers<UI_MESSAGE extends UIMessage> = {
  /**
   * The id of the chat.
   */
  readonly id: string;

  /**
   * Update the `messages` state locally. This is useful when you want to
   * edit the messages on the client, and then trigger the `reload` method
   * manually to regenerate the AI response.
   */
  setMessages: (
    messages: UI_MESSAGE[] | ((messages: UI_MESSAGE[]) => UI_MESSAGE[]),
  ) => void;

  error: Error | undefined;
} & Pick<
  AbstractChat<UI_MESSAGE>,
  | 'sendMessage'
  | 'regenerate'
  | 'stop'
  | 'resumeStream'
  | 'addToolResult'
  | 'addToolOutput'
  | 'status'
  | 'messages'
  | 'clearError'
>;

export type UseChatOptions<UI_MESSAGE extends UIMessage> = (
  | { chat: Chat<UI_MESSAGE> }
  | ChatInit<UI_MESSAGE>
) & {
  /**
Custom throttle wait in ms for the chat messages and data updates.
Default is undefined, which disables throttling.
   */
  experimental_throttle?: number;

  /**
   * Whether to resume an ongoing chat generation stream.
   */
  resume?: boolean;
};

export function useChat<UI_MESSAGE extends UIMessage = UIMessage>({
  experimental_throttle: throttleWaitMs,
  resume = false,
  ...options
}: UseChatOptions<UI_MESSAGE> = {}): UseChatHelpers<UI_MESSAGE> {
  // the Chat instance is created once and not recreated when options change,
  // so it would keep the transport from the first render forever.
  // keep the latest transport in a ref that is refreshed on every render and
  // hand `Chat` a stable proxy transport that always delegates to it
  const latestTransportRef = useRef<ChatTransport<UI_MESSAGE> | undefined>(
    undefined,
  );
  const defaultTransportRef = useRef<ChatTransport<UI_MESSAGE> | undefined>(
    undefined,
  );

  if (!('chat' in options)) {
    latestTransportRef.current = options.transport;
  }

  // resolve the latest transport and fallback to a lazily created default transport
  const getTransport = () =>
    latestTransportRef.current ??
    (defaultTransportRef.current ??= new DefaultChatTransport<UI_MESSAGE>());

  const createChat = (init: ChatInit<UI_MESSAGE>) =>
    new Chat<UI_MESSAGE>({
      ...init,
      transport: {
        sendMessages: sendOptions => getTransport().sendMessages(sendOptions),
        reconnectToStream: reconnectOptions =>
          getTransport().reconnectToStream(reconnectOptions),
      },
    });

  const chatRef = useRef<Chat<UI_MESSAGE>>(
    'chat' in options ? options.chat : createChat(options),
  );

  const shouldRecreateChat =
    ('chat' in options && options.chat !== chatRef.current) ||
    ('id' in options &&
      options.id != null &&
      chatRef.current.id !== options.id);

  if (shouldRecreateChat) {
    chatRef.current = 'chat' in options ? options.chat : createChat(options);
  }

  const chat = chatRef.current;
  const messagesSnapshotRef = useRef({
    chat,
    messages: chat.messages,
  });

  if (messagesSnapshotRef.current.chat !== chat) {
    messagesSnapshotRef.current = { chat, messages: chat.messages };
  }

  const subscribeToMessages = useCallback(
    (update: () => void) => {
      let isSubscribed = true;

      const updateMessages = () => {
        if (!isSubscribed || messagesSnapshotRef.current.chat !== chat) {
          return;
        }

        messagesSnapshotRef.current = { chat, messages: chat.messages };
        update();
      };

      const unsubscribe = chat['~registerMessagesCallback'](
        updateMessages,
        throttleWaitMs,
      );

      // Synchronize changes that may have happened between render and
      // subscription. useSyncExternalStore checks the snapshot after
      // subscribing and schedules a render when it changed.
      messagesSnapshotRef.current = { chat, messages: chat.messages };

      return () => {
        isSubscribed = false;
        unsubscribe();
      };
    },
    [chat, throttleWaitMs],
  );

  const getMessagesSnapshot = useCallback(
    () => messagesSnapshotRef.current.messages,
    [],
  );

  const messages = useSyncExternalStore(
    subscribeToMessages,
    getMessagesSnapshot,
    getMessagesSnapshot,
  );

  const subscribeToStatus = useCallback(
    (update: () => void) =>
      chat['~registerStatusCallback'](() => {
        if (messagesSnapshotRef.current.chat !== chat) {
          return;
        }

        if (chat.status === 'ready' || chat.status === 'error') {
          // Publish the latest messages before the terminal status can render.
          messagesSnapshotRef.current = { chat, messages: chat.messages };
        }

        update();
      }),
    [chat],
  );

  const getStatusSnapshot = useCallback(() => chat.status, [chat]);

  const status = useSyncExternalStore(
    subscribeToStatus,
    getStatusSnapshot,
    getStatusSnapshot,
  );

  const error = useSyncExternalStore(
    chatRef.current['~registerErrorCallback'],
    () => chatRef.current.error,
    () => chatRef.current.error,
  );

  const setMessages = useCallback(
    (
      messagesParam: UI_MESSAGE[] | ((messages: UI_MESSAGE[]) => UI_MESSAGE[]),
    ) => {
      if (typeof messagesParam === 'function') {
        messagesParam = messagesParam(chatRef.current.messages);
      }
      chatRef.current.messages = messagesParam;
    },
    [chatRef],
  );

  useEffect(() => {
    if (resume) {
      chatRef.current.resumeStream();
    }
  }, [resume, chatRef]);

  return {
    id: chatRef.current.id,
    messages,
    setMessages,
    sendMessage: chatRef.current.sendMessage,
    regenerate: chatRef.current.regenerate,
    clearError: chatRef.current.clearError,
    stop: chatRef.current.stop,
    error,
    resumeStream: chatRef.current.resumeStream,
    status,
    /**
     * @deprecated Use `addToolOutput` instead.
     */
    addToolResult: chatRef.current.addToolOutput,
    addToolOutput: chatRef.current.addToolOutput,
  };
}
