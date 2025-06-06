import {
  AbstractChat,
  ChatInit as BaseChatInit,
  ChatEvent,
  InferUIDataParts,
  UIDataPartSchemas,
  type CreateUIMessage,
  type UIMessage,
} from 'ai';
import { useCallback, useRef, useSyncExternalStore } from 'react';
import { Chat } from './chat.react';
import { throttle } from './throttle';

export type { CreateUIMessage, UIMessage };

export type UseChatHelpers<
  MESSAGE_METADATA = unknown,
  DATA_PART_SCHEMAS extends UIDataPartSchemas = UIDataPartSchemas,
> = {
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
    messages:
      | UIMessage<MESSAGE_METADATA, InferUIDataParts<DATA_PART_SCHEMAS>>[]
      | ((
          messages: UIMessage<
            MESSAGE_METADATA,
            InferUIDataParts<DATA_PART_SCHEMAS>
          >[],
        ) => UIMessage<
          MESSAGE_METADATA,
          InferUIDataParts<DATA_PART_SCHEMAS>
        >[]),
  ) => void;

  error: Error | undefined;
} & Pick<
  AbstractChat<MESSAGE_METADATA, DATA_PART_SCHEMAS>,
  | 'sendMessage'
  | 'reload'
  | 'stop'
  | 'experimental_resume'
  | 'addToolResult'
  | 'status'
  | 'messages'
>;

export type UseChatOptions<
  MESSAGE_METADATA = unknown,
  DATA_TYPE_SCHEMAS extends UIDataPartSchemas = UIDataPartSchemas,
> = (
  | { chat: Chat<MESSAGE_METADATA, DATA_TYPE_SCHEMAS> }
  | BaseChatInit<MESSAGE_METADATA, DATA_TYPE_SCHEMAS>
) & {
  /**
Custom throttle wait in ms for the chat messages and data updates.
Default is undefined, which disables throttling.
   */
  experimental_throttle?: number;
};

export function useChat<
  MESSAGE_METADATA = unknown,
  DATA_PART_SCHEMAS extends UIDataPartSchemas = UIDataPartSchemas,
>({
  experimental_throttle: throttleWaitMs,
  ...options
}: UseChatOptions<MESSAGE_METADATA, DATA_PART_SCHEMAS> = {}): UseChatHelpers<
  MESSAGE_METADATA,
  DATA_PART_SCHEMAS
> {
  const chatRef = useRef('chat' in options ? options.chat : new Chat(options));

  const subscribe = useCallback(
    ({
      onStoreChange,
      eventType,
    }: {
      onStoreChange: () => void;
      eventType: ChatEvent['type'];
    }) =>
      chatRef.current.subscribe({
        onChange: event => {
          if (event.type !== eventType) return;
          onStoreChange();
        },
      }),
    [chatRef],
  );

  const addToolResult = useCallback(
    (
      options: Parameters<
        Chat<MESSAGE_METADATA, DATA_PART_SCHEMAS>['addToolResult']
      >[0],
    ) => chatRef.current.addToolResult(options),
    [chatRef],
  );

  const status = useSyncExternalStore(
    callback =>
      subscribe({
        onStoreChange: callback,
        eventType: 'status-changed',
      }),
    () => chatRef.current.status,
    () => chatRef.current.status,
  );

  const subscribeToChatStoreForMessages = useCallback(
    (callback: () => void) => {
      return subscribe({
        onStoreChange: throttleWaitMs
          ? throttle(callback, throttleWaitMs)
          : callback,
        eventType: 'messages-changed',
      });
    },
    [subscribe, throttleWaitMs],
  );

  const messages = useSyncExternalStore(
    callback => subscribeToChatStoreForMessages(callback),
    () => chatRef.current.messages,
    () => chatRef.current.messages,
  );

  const setMessages = useCallback(
    (
      messagesParam:
        | UIMessage<MESSAGE_METADATA, InferUIDataParts<DATA_PART_SCHEMAS>>[]
        | ((
            messages: UIMessage<
              MESSAGE_METADATA,
              InferUIDataParts<DATA_PART_SCHEMAS>
            >[],
          ) => UIMessage<
            MESSAGE_METADATA,
            InferUIDataParts<DATA_PART_SCHEMAS>
          >[]),
    ) => {
      if (typeof messagesParam === 'function') {
        messagesParam = messagesParam(messages);
      }

      chatRef.current.messages = messagesParam;
    },
    [chatRef, messages],
  );

  return {
    id: chatRef.current.id,
    messages,
    setMessages,
    sendMessage: chatRef.current.sendMessage,
    reload: chatRef.current.reload,
    stop: chatRef.current.stop,
    error: chatRef.current.error,
    experimental_resume: chatRef.current.experimental_resume,
    status,
    addToolResult,
  };
}
