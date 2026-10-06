import {
  type AbstractChat,
  type ChatInit,
  type ChatTransport,
  type CreateUIMessage,
  type UIMessage,
  DefaultChatTransport,
} from 'ai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
   * Whether to automatically resume an ongoing chat generation stream.
   */
  resume?: boolean;
};

type AutomaticResumeState = {
  registrations: Set<object>;
  cleanupVisibilityListener?: () => void;
};

const automaticResumeStates = new WeakMap<object, AutomaticResumeState>();

function registerAutomaticResume<UI_MESSAGE extends UIMessage>({
  chat,
  registration,
}: {
  chat: Chat<UI_MESSAGE>;
  registration: object;
}) {
  let state = automaticResumeStates.get(chat);

  if (state == null) {
    let cleanupVisibilityListener: (() => void) | undefined;

    if (typeof document !== 'undefined') {
      const onVisibilityChange = () => {
        if (document.visibilityState === 'visible' && chat.status === 'error') {
          void chat.resumeStream();
        }
      };

      document.addEventListener('visibilitychange', onVisibilityChange);
      cleanupVisibilityListener = () => {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      };
    }

    state = {
      registrations: new Set(),
      cleanupVisibilityListener,
    };
    automaticResumeStates.set(chat, state);
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

export function useChat<UI_MESSAGE extends UIMessage = UIMessage>({
  throttle,
  experimental_throttle,
  resume = false,
  ...options
}: UseChatOptions<UI_MESSAGE> = {}): UseChatHelpers<UI_MESSAGE> {
  const throttleWaitMs = throttle ?? experimental_throttle;
  const automaticResumeRegistration = useRef({});
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

  const chatKey = 'chat' in options ? options.chat : options.id;
  const { chat, isExternallyManaged } = useMemo(
    () => ({
      chat: 'chat' in options ? options.chat : new Chat(chatOptions),
      isExternallyManaged: 'chat' in options,
    }),
    [chatKey],
  );

  useEffect(() => {
    if (isExternallyManaged) {
      return;
    }

    return () => {
      void chat.stop();
    };
  }, [chat, isExternallyManaged]);

  // Chat owns the live state; React owns the snapshot used for rendering.
  // useSyncExternalStore would make streaming updates synchronous and can
  // repeatedly restart navigation renders. Ordinary state updates let React
  // schedule both. Automatically wrapping publication in startTransition can
  // group it with a suspended navigation in the same root, holding back streamed
  // text and local edits.
  // Each consumer subscribes independently, so different throttle intervals can
  // produce different rendered snapshots of the same Chat.
  const [snapshot, setSnapshot] = useState(() => readChatSnapshot(chat));

  // React retries this component before rendering children, so they cannot
  // commit the previous Chat's snapshot. Resubscribe only after the swap commits.
  if (snapshot.chat !== chat) {
    setSnapshot(readChatSnapshot(chat));
  }

  useEffect(() => {
    let isSubscribed = true;
    const publishSnapshot = () => {
      // A trailing throttled callback can run after cleanup. Check before
      // enqueueing; keep the state updater independent of mutable effect state.
      if (!isSubscribed) {
        return;
      }

      const nextSnapshot = readChatSnapshot(chat);
      setSnapshot(current =>
        current.chat !== chat || equalChatSnapshots(current, nextSnapshot)
          ? current
          : nextSnapshot,
      );
    };

    // Only message notifications are throttled. Status and error notifications
    // publish the complete snapshot, so ready/error cannot commit beside stale
    // messages even when a throttled message notification is still pending.
    const unsubscribes = [
      chat['~registerMessagesCallback'](publishSnapshot, throttleWaitMs),
      chat['~registerStatusCallback'](publishSnapshot),
      chat['~registerErrorCallback'](publishSnapshot),
    ];

    // Catch changes between render and subscription, including updates that
    // arrived before this consumer mounted or while its Chat was being replaced.
    const nextSnapshot = readChatSnapshot(chat);
    setSnapshot(current =>
      equalChatSnapshots(current, nextSnapshot) ? current : nextSnapshot,
    );

    return () => {
      isSubscribed = false;
      unsubscribes.forEach(unsubscribe => unsubscribe());
    };
  }, [chat, throttleWaitMs]);

  const { messages, status, error } = snapshot;

  const setMessages = useCallback(
    (
      messagesParam: UI_MESSAGE[] | ((messages: UI_MESSAGE[]) => UI_MESSAGE[]),
    ) => {
      if (typeof messagesParam === 'function') {
        messagesParam = messagesParam(chat.messages);
      }
      chat.messages = messagesParam;
    },
    [chat],
  );

  useEffect(() => {
    if (resume) {
      return registerAutomaticResume({
        chat,
        registration: automaticResumeRegistration.current,
      });
    }
  }, [resume, chat]);

  return {
    id: chat.id,
    messages,
    setMessages,
    sendMessage: chat.sendMessage,
    regenerate: chat.regenerate,
    clearError: chat.clearError,
    stop: chat.stop,
    error,
    resumeStream: chat.resumeStream,
    status,
    /**
     * @deprecated Use `addToolOutput` instead.
     */
    addToolResult: chat.addToolOutput,
    addToolOutput: chat.addToolOutput,
    addToolApprovalResponse: chat.addToolApprovalResponse,
  };
}
