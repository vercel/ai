import {
  AbstractChat,
  AbstractChatInit,
  ChatEvent,
  convertFileListToFileUIParts,
  InferUIDataParts,
  UIDataPartSchemas,
  type ChatRequestOptions,
  type CreateUIMessage,
  type FileUIPart,
  type UIMessage,
  type UseChatOptions,
} from 'ai';
import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { Chat, ChatInit } from './react-chat';
import { throttle } from './throttle';

export type { CreateUIMessage, UIMessage, UseChatOptions };

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

  /** The current value of the input */
  input: string;

  /** setState-powered method to update the input value */
  setInput: React.Dispatch<React.SetStateAction<string>>;

  /** An input/textarea-ready onChange handler to control the value of the input */
  handleInputChange: (
    e:
      | React.ChangeEvent<HTMLInputElement>
      | React.ChangeEvent<HTMLTextAreaElement>,
  ) => void;

  /** Form submission handler to automatically reset input and append a user message */
  handleSubmit: (
    event?: { preventDefault?: () => void },
    chatRequestOptions?: ChatRequestOptions & {
      files?: FileList | FileUIPart[];
    },
  ) => void;

  error: Error | undefined;
} & Pick<
  AbstractChat<MESSAGE_METADATA, DATA_PART_SCHEMAS>,
  | 'append'
  | 'reload'
  | 'stop'
  | 'experimental_resume'
  | 'addToolResult'
  | 'status'
  | 'messages'
>;

export type UseChatOptions2<
  MESSAGE_METADATA = unknown,
  DATA_TYPE_SCHEMAS extends UIDataPartSchemas = UIDataPartSchemas,
> = (
  | { chat: Chat<MESSAGE_METADATA, DATA_TYPE_SCHEMAS> }
  | ChatInit<MESSAGE_METADATA, DATA_TYPE_SCHEMAS>
) & {
  /**
  /**
   * Initial input of the chat.
   */
  initialInput?: string;
} & Pick<
    AbstractChatInit<MESSAGE_METADATA, DATA_TYPE_SCHEMAS>,
    'onToolCall' | 'onFinish' | 'onError'
  >;

export function useChat<
  MESSAGE_METADATA = unknown,
  DATA_PART_SCHEMAS extends UIDataPartSchemas = UIDataPartSchemas,
>({
  initialInput = '',
  experimental_throttle: throttleWaitMs,
  ...options
}: UseChatOptions2<MESSAGE_METADATA, DATA_PART_SCHEMAS> & {
  /**
Custom throttle wait in ms for the chat messages and data updates.
Default is undefined, which disables throttling.
   */
  experimental_throttle?: number;
}): UseChatHelpers<MESSAGE_METADATA, DATA_PART_SCHEMAS> {
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

  // Input state and handlers.
  const [input, setInput] = useState(initialInput);

  const handleSubmit = useCallback(
    async (
      event?: { preventDefault?: () => void },
      options: ChatRequestOptions & {
        files?: FileList | FileUIPart[];
      } = {},
    ) => {
      event?.preventDefault?.();

      const fileParts = Array.isArray(options?.files)
        ? options.files
        : await convertFileListToFileUIParts(options?.files);

      if (!input && fileParts.length === 0) return;

      chatRef.current.append(
        {
          id: chatRef.current.generateId(),
          role: 'user',
          metadata: undefined,
          parts: [...fileParts, { type: 'text', text: input }],
        },
        {
          headers: options.headers,
          body: options.body,
        },
      );

      setInput('');
    },
    [input, chatRef],
  );

  const handleInputChange = (e: any) => {
    setInput(e.target.value);
  };

  return {
    messages,
    id: chatRef.current.id,
    setMessages,
    append: chatRef.current.append,
    reload: chatRef.current.reload,
    stop: chatRef.current.stop,
    error: chatRef.current.error,
    experimental_resume: chatRef.current.experimental_resume,
    input,
    setInput,
    handleInputChange,
    handleSubmit,
    status,
    addToolResult,
  };
}
