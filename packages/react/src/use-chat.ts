import {
  AbstractChat,
  ChatInit,
  InferUIDataParts,
  UIDataPartSchemas,
  type CreateUIMessage,
  type UIMessage,
} from 'ai';
import { useCallback, useRef, useSyncExternalStore } from 'react';
import { Chat } from './chat.react';

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
  | ChatInit<MESSAGE_METADATA, DATA_TYPE_SCHEMAS>
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

  const subscribeToMessages = useCallback(
    (update: () => void) =>
      chatRef.current['~registerMessagesCallback'](update, throttleWaitMs),
    [throttleWaitMs],
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
    [messages],
  );

  return {
    id: chatRef.current.id,
    messages,
    setMessages,
    sendMessage: chatRef.current.sendMessage,
    reload: chatRef.current.reload,
    stop: chatRef.current.stop,
    error,
    experimental_resume: chatRef.current.experimental_resume,
    status,
    addToolResult: chatRef.current.addToolResult,
  };
}
