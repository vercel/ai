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
  | 'addToolApprovalResponse'
  | 'status'
  | 'messages'
  | 'clearError'
>;

export type UseChatOptions<UI_MESSAGE extends UIMessage> = (
  | { chat: Chat<UI_MESSAGE> }
  | ChatInit<UI_MESSAGE>
) & {
  /**
   * Custom throttle wait in ms for the chat messages and data updates.
   * Default is undefined, which disables throttling.
   */
  throttle?: number;

  /**
   * @deprecated Use `throttle` instead.
   */
  experimental_throttle?: number;

  /**
   * Whether to resume an ongoing chat generation stream.
   */
  resume?: boolean;
};

export function useChat<UI_MESSAGE extends UIMessage = UIMessage>({
  throttle,
  experimental_throttle,
  resume = false,
  ...options
}: UseChatOptions<UI_MESSAGE> = {}): UseChatHelpers<UI_MESSAGE> {
  const throttleWaitMs = throttle ?? experimental_throttle;
  // the Chat instance is created once and not recreated when options change,
  // so it would normally keep the callbacks/transport from the first render forever

  // keep latest values in a ref that is refreshed on every render,
  // and hand `Chat` stable wrappers that read from it to avoid stale closures
  const latestRef = useRef<
    Partial<
      Pick<
        ChatInit<UI_MESSAGE>,
        | 'onToolCall'
        | 'onData'
        | 'onFinish'
        | 'onError'
        | 'sendAutomaticallyWhen'
        | 'transport'
      >
    >
  >({});

  if (!('chat' in options)) {
    latestRef.current = {
      onToolCall: options.onToolCall,
      onData: options.onData,
      onFinish: options.onFinish,
      onError: options.onError,
      sendAutomaticallyWhen: options.sendAutomaticallyWhen,
      transport: options.transport,
    };
  }

  // resolve the latest transport and fallback to a lazily created default transport
  let defaultTransport: ChatTransport<UI_MESSAGE> | undefined;
  const getTransport = () =>
    latestRef.current.transport ??
    (defaultTransport ??= new DefaultChatTransport<UI_MESSAGE>());

  // give `Chat` stable wrappers that always read the latest values from `latestRef`
  const chatOptions: typeof options = {
    ...options,
    transport: {
      sendMessages: sendOptions => getTransport().sendMessages(sendOptions),
      reconnectToStream: reconnectOptions =>
        getTransport().reconnectToStream(reconnectOptions),
    },
    onToolCall: arg => latestRef.current.onToolCall?.(arg),
    onData: arg => latestRef.current.onData?.(arg),
    onFinish: arg => latestRef.current.onFinish?.(arg),
    onError: arg => latestRef.current.onError?.(arg),
    sendAutomaticallyWhen: arg =>
      latestRef.current.sendAutomaticallyWhen?.(arg) ?? false,
  };

  const chatStateRef = useRef({
    chat: 'chat' in options ? options.chat : new Chat(chatOptions),
    isExternallyManaged: 'chat' in options,
  });

  const shouldRecreateChat =
    ('chat' in options && options.chat !== chatStateRef.current.chat) ||
    ('id' in options &&
      options.id != null &&
      chatStateRef.current.chat.id !== options.id);

  if (shouldRecreateChat) {
    chatStateRef.current = {
      chat: 'chat' in options ? options.chat : new Chat(chatOptions),
      isExternallyManaged: 'chat' in options,
    };
  }

  const { chat, isExternallyManaged } = chatStateRef.current;

  useEffect(() => {
    if (isExternallyManaged) {
      return;
    }

    return () => {
      void chat.stop();
    };
  }, [chat, isExternallyManaged]);

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
    chatStateRef.current.chat['~registerErrorCallback'],
    () => chatStateRef.current.chat.error,
    () => chatStateRef.current.chat.error,
  );

  const setMessages = useCallback(
    (
      messagesParam: UI_MESSAGE[] | ((messages: UI_MESSAGE[]) => UI_MESSAGE[]),
    ) => {
      if (typeof messagesParam === 'function') {
        messagesParam = messagesParam(chatStateRef.current.chat.messages);
      }
      chatStateRef.current.chat.messages = messagesParam;
    },
    [chatStateRef],
  );

  useEffect(() => {
    if (resume) {
      chatStateRef.current.chat.resumeStream();
    }
  }, [resume, chatStateRef]);

  return {
    id: chatStateRef.current.chat.id,
    messages,
    setMessages,
    sendMessage: chatStateRef.current.chat.sendMessage,
    regenerate: chatStateRef.current.chat.regenerate,
    clearError: chatStateRef.current.chat.clearError,
    stop: chatStateRef.current.chat.stop,
    error,
    resumeStream: chatStateRef.current.chat.resumeStream,
    status,
    /**
     * @deprecated Use `addToolOutput` instead.
     */
    addToolResult: chatStateRef.current.chat.addToolOutput,
    addToolOutput: chatStateRef.current.chat.addToolOutput,
    addToolApprovalResponse: chatStateRef.current.chat.addToolApprovalResponse,
  };
}
