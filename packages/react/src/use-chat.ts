import type {
  AbstractChat,
  ChatInit,
  ChatTransport,
  CreateUIMessage,
  UIMessage,
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
   * Whether to resume an ongoing chat generation stream.
   */
  resume?: boolean;
};

export function useChat<UI_MESSAGE extends UIMessage = UIMessage>({
  experimental_throttle: throttleWaitMs,
  resume = false,
  ...options
}: UseChatOptions<UI_MESSAGE> = {}): UseChatHelpers<UI_MESSAGE> {
  // Create a single ref for all callbacks to avoid stale closures
  const callbacksRef = useRef(
    !('chat' in options)
      ? {
          onToolCall: options.onToolCall,
          onData: options.onData,
          onFinish: options.onFinish,
          onError: options.onError,
          sendAutomaticallyWhen: options.sendAutomaticallyWhen,
        }
      : {},
  );

  // Update callbacks ref on each render to keep them current
  if (!('chat' in options)) {
    callbacksRef.current = {
      onToolCall: options.onToolCall,
      onData: options.onData,
      onFinish: options.onFinish,
      onError: options.onError,
      sendAutomaticallyWhen: options.sendAutomaticallyWhen,
    };
  }

  // Keep the user-supplied transport (and any inline `body` / `headers` /
  // `prepareSendMessagesRequest` baked into it) addressable across renders.
  // The Chat instance is created once and holds a stable reference, so without
  // this ref the transport captured on the first render would be reused
  // forever — see https://github.com/vercel/ai/issues/7819.
  const userTransportRef = useRef<ChatTransport<UI_MESSAGE> | undefined>(
    !('chat' in options) ? options.transport : undefined,
  );
  if (!('chat' in options)) {
    userTransportRef.current = options.transport;
  }

  // A stable delegating transport. Its identity never changes, so Chat keeps
  // it across renders, but each method call reads through to whatever the
  // most-recent user transport is. If the user does not supply a transport,
  // this ref stays unset and Chat falls back to its own default.
  const stableTransportRef = useRef<ChatTransport<UI_MESSAGE> | undefined>(
    undefined,
  );
  if (
    stableTransportRef.current === undefined &&
    userTransportRef.current !== undefined
  ) {
    stableTransportRef.current = {
      sendMessages: args => {
        const t = userTransportRef.current;
        if (t === undefined) {
          throw new Error(
            'useChat: transport was provided initially but is now undefined',
          );
        }
        return t.sendMessages(args);
      },
      reconnectToStream: args => {
        const t = userTransportRef.current;
        if (t === undefined) {
          throw new Error(
            'useChat: transport was provided initially but is now undefined',
          );
        }
        return t.reconnectToStream(args);
      },
    };
  }

  // Ensure the Chat instance has the latest callbacks and a transport whose
  // closures over component state stay fresh.
  const optionsWithCallbacks: typeof options =
    'chat' in options
      ? options
      : {
          ...options,
          ...(stableTransportRef.current !== undefined
            ? { transport: stableTransportRef.current }
            : {}),
          onToolCall: arg => callbacksRef.current.onToolCall?.(arg),
          onData: arg => callbacksRef.current.onData?.(arg),
          onFinish: arg => callbacksRef.current.onFinish?.(arg),
          onError: arg => callbacksRef.current.onError?.(arg),
          sendAutomaticallyWhen: arg =>
            callbacksRef.current.sendAutomaticallyWhen?.(arg) ?? false,
        };

  const chatRef = useRef<Chat<UI_MESSAGE>>(
    'chat' in options ? options.chat : new Chat(optionsWithCallbacks),
  );

  const shouldRecreateChat =
    ('chat' in options && options.chat !== chatRef.current) ||
    ('id' in options && chatRef.current.id !== options.id);

  if (shouldRecreateChat) {
    chatRef.current =
      'chat' in options ? options.chat : new Chat(optionsWithCallbacks);
  }

  const subscribeToMessages = useCallback(
    (update: () => void) =>
      chatRef.current['~registerMessagesCallback'](update, throttleWaitMs),
    // `chatRef.current.id` is required to trigger re-subscription when the chat ID changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [throttleWaitMs, chatRef.current.id],
  );

  const messages = useSyncExternalStore(
    subscribeToMessages,
    () => chatRef.current.messages,
    () => chatRef.current.messages,
  );

  const status = useSyncExternalStore(
    chatRef.current['~registerStatusCallback'],
    () => chatRef.current.status,
    () => chatRef.current.status,
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
