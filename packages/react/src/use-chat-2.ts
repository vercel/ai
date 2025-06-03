import {
  ChatStore,
  ChatStoreOptions,
  convertFileListToFileUIParts,
  defaultChatStoreOptions,
  generateId as generateIdFunc,
  IdGenerator,
  InferUIDataParts,
  ToolCall,
  UIDataPartSchemas,
  type ChatRequestOptions,
  type ChatStoreEvent,
  type CreateUIMessage,
  type FileUIPart,
  type UIMessage,
  type UseChatOptions,
} from 'ai';
import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { createChatStore } from './chat-store';
import { throttle } from './throttle';

export type { CreateUIMessage, UIMessage, UseChatOptions };

export type UseChatHelpers2<
  MESSAGE_METADATA = unknown,
  DATA_PART_SCHEMAS extends UIDataPartSchemas = UIDataPartSchemas,
> = {
  /**
   * The id of the chat.
   */
  readonly chatId: string;

  /**
   * Hook status:
   *
   * - `submitted`: The message has been sent to the API and we're awaiting the start of the response stream.
   * - `streaming`: The response is actively streaming in from the API, receiving chunks of data.
   * - `ready`: The full response has been received and processed; a new user message can be submitted.
   * - `error`: An error occurred during the API request, preventing successful completion.
   */
  readonly status: 'submitted' | 'streaming' | 'ready' | 'error';

  /** Current messages in the chat */
  readonly messages: UIMessage<
    MESSAGE_METADATA,
    InferUIDataParts<DATA_PART_SCHEMAS>
  >[];

  /** The error object of the API request */
  readonly error: undefined | Error;

  /**
   * Append a user message to the chat list. This triggers the API call to fetch
   * the assistant's response.
   *
   * @param message The message to append
   * @param options Additional options to pass to the API call
   */
  append: (
    message: CreateUIMessage<
      MESSAGE_METADATA,
      InferUIDataParts<DATA_PART_SCHEMAS>
    >,
    options?: ChatRequestOptions,
  ) => Promise<void>;

  /**
   * Reload the last AI chat response for the given chat history. If the last
   * message isn't from the assistant, it will request the API to generate a
   * new response.
   */
  reload: (
    chatRequestOptions?: ChatRequestOptions,
  ) => Promise<string | null | undefined>;

  /**
   * Abort the current request immediately, keep the generated tokens if any.
   */
  stop: () => void;

  /**
   * Resume an ongoing chat generation stream. This does not resume an aborted generation.
   */
  experimental_resume: () => void;

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

  addToolResult: ({
    toolCallId,
    result,
  }: {
    toolCallId: string;
    result: any;
  }) => void;
};

export type UseChatOptions2<
  MESSAGE_METADATA = unknown,
  DATA_TYPE_SCHEMAS extends UIDataPartSchemas = UIDataPartSchemas,
> = {
  /**
   * A unique identifier for the chat. If not provided, a random one will be
   * generated. When provided, the `useChat` hook with the same `id` will
   * have shared states across components.
   */
  chatId?: string;

  /**
   * Initial input of the chat.
   */
  initialInput?: string;

  /**
  Optional callback function that is invoked when a tool call is received.
  Intended for automatic client-side tool execution.

  You can optionally return a result for the tool call,
  either synchronously or asynchronously.
     */
  onToolCall?: ({
    toolCall,
  }: {
    toolCall: ToolCall<string, unknown>;
  }) => void | Promise<unknown> | unknown;

  /**
   * Optional callback function that is called when the assistant message is finished streaming.
   *
   * @param message The message that was streamed.
   */
  onFinish?: (options: {
    message: UIMessage<MESSAGE_METADATA, InferUIDataParts<DATA_TYPE_SCHEMAS>>;
  }) => void;

  /**
   * Callback function to be called when an error is encountered.
   */
  onError?: (error: Error) => void;

  /**
   * A way to provide a function that is going to be used for ids for messages and the chat.
   * If not provided the default AI SDK `generateId` is used.
   */
  generateId?: IdGenerator;

  /**
   * Chat store that should be used.
   * It must not change during the component lifecycle.
   *
   * When a ChatStore is provided, it will be used as is.
   * It should be stable and the stability is guaranteed by the user.
   *
   * When a function is provided, it will be called to create a new chat store.
   * The function will be called when the hook is mounted and the chat store will be
   * created.
   * The function will be called with the same arguments as the hook is called with.
   * The function should return a ChatStoreOptions object.
   *
   * When no value is provided, a default chat store will be created.
   */
  chatStore?:
    | ChatStore<MESSAGE_METADATA, DATA_TYPE_SCHEMAS>
    | (() => ChatStoreOptions<MESSAGE_METADATA, DATA_TYPE_SCHEMAS>);
};

export function useChat2<
  MESSAGE_METADATA = unknown,
  DATA_PART_SCHEMAS extends UIDataPartSchemas = UIDataPartSchemas,
>({
  chatId,
  initialInput = '',
  onToolCall,
  onFinish,
  onError,
  generateId = generateIdFunc,
  experimental_throttle: throttleWaitMs,
  chatStore: chatStoreArg,
}: UseChatOptions2<MESSAGE_METADATA, DATA_PART_SCHEMAS> & {
  /**
Custom throttle wait in ms for the chat messages and data updates.
Default is undefined, which disables throttling.
   */
  experimental_throttle?: number;
} = {}): UseChatHelpers2<MESSAGE_METADATA, DATA_PART_SCHEMAS> {
  // Generate ID once, store in state for stability across re-renders
  const [hookId] = useState(generateId);

  // Use the caller-supplied ID if available; otherwise, fall back to our stable ID
  const stableChatId = chatId ?? hookId;

  // chat store setup
  const chatStore = useRef(
    chatStoreArg == null
      ? createChatStore(
          defaultChatStoreOptions<MESSAGE_METADATA, DATA_PART_SCHEMAS>({
            api: '/api/chat',
            generateId,
          })(),
        )
      : typeof chatStoreArg === 'function'
        ? createChatStore(chatStoreArg())
        : chatStoreArg,
  );

  // ensure the chat is in the store
  if (!chatStore.current.hasChat(stableChatId)) {
    chatStore.current.addChat(stableChatId, []);
  }

  const subscribe = useCallback(
    ({
      onStoreChange,
      eventType,
    }: {
      onStoreChange: () => void;
      eventType: ChatStoreEvent['type'];
    }) => {
      return chatStore.current.subscribe({
        onChatChanged: event => {
          if (event.chatId !== stableChatId || event.type !== eventType) return;
          onStoreChange();
        },
      });
    },
    [chatStore, stableChatId],
  );

  const addToolResult = useCallback(
    (
      options: Omit<
        Parameters<
          ChatStore<MESSAGE_METADATA, DATA_PART_SCHEMAS>['addToolResult']
        >[0],
        'chatId'
      >,
    ) => chatStore.current.addToolResult({ chatId: stableChatId, ...options }),
    [chatStore, stableChatId],
  );

  const stopStream = useCallback(() => {
    chatStore.current.stopStream({ chatId: stableChatId });
  }, [chatStore, stableChatId]);

  const error = useSyncExternalStore(
    callback =>
      subscribe({
        onStoreChange: callback,
        eventType: 'chat-status-changed',
      }),
    () => chatStore.current.getError(stableChatId),
    () => chatStore.current.getError(stableChatId),
  );

  const status = useSyncExternalStore(
    callback =>
      subscribe({
        onStoreChange: callback,
        eventType: 'chat-status-changed',
      }),
    () => chatStore.current.getStatus(stableChatId),
    () => chatStore.current.getStatus(stableChatId),
  );

  const subscribeToChatStoreForMessages = useCallback(
    (callback: () => void) => {
      return subscribe({
        onStoreChange: throttleWaitMs
          ? throttle(callback, throttleWaitMs)
          : callback,
        eventType: 'chat-messages-changed',
      });
    },
    [subscribe, throttleWaitMs],
  );

  const messages = useSyncExternalStore(
    callback => subscribeToChatStoreForMessages(callback),
    () => chatStore.current.getMessages(stableChatId),
    () => chatStore.current.getMessages(stableChatId),
  );

  const append = useCallback(
    (
      message: CreateUIMessage<
        MESSAGE_METADATA,
        InferUIDataParts<DATA_PART_SCHEMAS>
      >,
      { headers, body }: ChatRequestOptions = {},
    ) =>
      chatStore.current.submitMessage({
        chatId: stableChatId,
        message,
        headers,
        body,
        onError,
        onToolCall,
        onFinish,
      }),
    [chatStore, stableChatId, onError, onToolCall, onFinish],
  );

  const reload = useCallback(
    async ({ headers, body }: ChatRequestOptions = {}) =>
      chatStore.current.resubmitLastUserMessage({
        chatId: stableChatId,
        headers,
        body,
        onError,
        onToolCall,
        onFinish,
      }),
    [chatStore, stableChatId, onError, onToolCall, onFinish],
  );
  const stop = useCallback(() => stopStream(), [stopStream]);

  const experimental_resume = useCallback(
    async () =>
      chatStore.current.resumeStream({
        chatId: stableChatId,
        onError,
        onToolCall,
        onFinish,
      }),
    [chatStore, stableChatId, onError, onToolCall, onFinish],
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

      chatStore.current.setMessages({
        id: stableChatId,
        messages: messagesParam,
      });
    },
    [stableChatId, messages],
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

      append(
        {
          id: generateId(),
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
    [input, generateId, append],
  );

  const handleInputChange = (e: any) => {
    setInput(e.target.value);
  };

  return {
    messages,
    chatId: stableChatId,
    setMessages,
    error,
    append,
    reload,
    stop,
    experimental_resume,
    input,
    setInput,
    handleInputChange,
    handleSubmit,
    status,
    addToolResult,
  };
}
