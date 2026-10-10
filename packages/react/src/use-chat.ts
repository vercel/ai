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
  experimental_throttle?: number;

  /**
   * Whether to automatically resume an ongoing chat generation stream.
   */
  resume?: boolean;
};

<<<<<<< HEAD
=======
type AutomaticResumeState = {
  registrations: Set<object>;
  cleanupVisibilityListener?: () => void;
  pendingVisibilityResume?: Promise<void>;
};

const automaticResumeStates = new WeakMap<object, AutomaticResumeState>();

type AutomaticallyResumableChat = {
  '~resumeStreamIfDisconnected': (options: {
    shouldResume: () => boolean;
  }) => Promise<void>;
};

/**
 * When the document becomes visible again, resume the chat stream if it was
 * interrupted by a network disconnect while the page was in the background.
 */
function resumeOnVisible<UI_MESSAGE extends UIMessage>({
  chat,
  state,
}: {
  chat: Chat<UI_MESSAGE>;
  state: AutomaticResumeState;
}) {
  if (
    document.visibilityState !== 'visible' ||
    state.pendingVisibilityResume != null
  ) {
    return;
  }

  const isRegistered = () =>
    automaticResumeStates.get(chat) === state && state.registrations.size > 0;

  const clearPendingResume = () => {
    state.pendingVisibilityResume = undefined;
  };

  const resumableChat = chat as Chat<UI_MESSAGE> & AutomaticallyResumableChat;

  state.pendingVisibilityResume = resumableChat['~resumeStreamIfDisconnected']({
    shouldResume: () =>
      isRegistered() && document.visibilityState === 'visible',
  }).then(clearPendingResume, clearPendingResume);
}

function registerAutomaticResume<UI_MESSAGE extends UIMessage>({
  chat,
  registration,
}: {
  chat: Chat<UI_MESSAGE>;
  registration: object;
}) {
  let state = automaticResumeStates.get(chat);

  if (state == null) {
    const newState: AutomaticResumeState = { registrations: new Set() };
    automaticResumeStates.set(chat, newState);
    state = newState;

    if (typeof document !== 'undefined') {
      const onVisibilityChange = () =>
        resumeOnVisible({ chat, state: newState });

      document.addEventListener('visibilitychange', onVisibilityChange);
      newState.cleanupVisibilityListener = () => {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      };
    }
  }

  const { registrations } = state;
  const shouldResume = registrations.size === 0;
  registrations.add(registration);

  if (
    shouldResume &&
    chat.status !== 'submitted' &&
    chat.status !== 'streaming'
  ) {
    void chat.resumeStream();
  }

  return () => {
    registrations.delete(registration);

    if (registrations.size === 0) {
      state.cleanupVisibilityListener?.();
      automaticResumeStates.delete(chat);
    }
  };
}

type ChatSnapshot<UI_MESSAGE extends UIMessage> = {
  chat: Chat<UI_MESSAGE>;
  messages: UI_MESSAGE[];
  status: Chat<UI_MESSAGE>['status'];
  error: Error | undefined;
};

function readChatSnapshot<UI_MESSAGE extends UIMessage>(
  chat: Chat<UI_MESSAGE>,
): ChatSnapshot<UI_MESSAGE> {
  return {
    chat,
    messages: chat.messages,
    status: chat.status,
    error: chat.error,
  };
}

function equalChatSnapshots<UI_MESSAGE extends UIMessage>(
  current: ChatSnapshot<UI_MESSAGE>,
  next: ChatSnapshot<UI_MESSAGE>,
) {
  return (
    current.chat === next.chat &&
    current.messages === next.messages &&
    current.status === next.status &&
    current.error === next.error
  );
}

>>>>>>> eab278a61c (fix: resume interrupted chat streams after returning to a backgrounded page (#22035))
export function useChat<UI_MESSAGE extends UIMessage = UIMessage>({
  experimental_throttle: throttleWaitMs,
  resume = false,
  ...options
}: UseChatOptions<UI_MESSAGE> = {}): UseChatHelpers<UI_MESSAGE> {
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

  const chatRef = useRef<Chat<UI_MESSAGE>>(
    'chat' in options ? options.chat : new Chat(chatOptions),
  );

  const shouldRecreateChat =
    ('chat' in options && options.chat !== chatRef.current) ||
    ('id' in options &&
      options.id != null &&
      chatRef.current.id !== options.id);

  if (shouldRecreateChat) {
    chatRef.current = 'chat' in options ? options.chat : new Chat(chatOptions);
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
    addToolApprovalResponse: chatRef.current.addToolApprovalResponse,
  };
}
