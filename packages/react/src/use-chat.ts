import type { AbstractChat, ChatInit, CreateUIMessage, UIMessage } from 'ai';
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

  // Ensure the Chat instance has the latest callbacks
  const optionsWithCallbacks: typeof options = {
    ...options,
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

  const chat = chatRef.current;

  const subscribeToMessages = useCallback(
    (update: () => void) =>
      chat['~registerMessagesCallback'](update, throttleWaitMs),
    [chat, throttleWaitMs],
  );

  const messages = useSyncExternalStore(
    subscribeToMessages,
    () => chat.messages,
    () => chat.messages,
  );

  const status = useSyncExternalStore(
    chat['~registerStatusCallback'],
    () => chat.status,
    () => chat.status,
  );

  const error = useSyncExternalStore(
    chat['~registerErrorCallback'],
    () => chat.error,
    () => chat.error,
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
      chat.resumeStream();
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
