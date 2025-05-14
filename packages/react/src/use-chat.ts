import type {
  ChatRequestOptions,
  CreateUIMessage,
  FileUIPart,
  UIMessage,
  UseChatOptions,
} from 'ai';
import {
  ChatStore,
  convertFileListToFileUIParts,
  defaultChatStore,
  generateId as generateIdFunc,
  type ChatStoreEvent,
} from 'ai';
import { useCallback, useRef, useState, useSyncExternalStore } from 'react';

export type { CreateUIMessage, UIMessage, UseChatOptions };

export type UseChatHelpers<
  MESSAGE_METADATA = unknown,
  DATA_TYPES extends Record<string, unknown> = Record<string, unknown>,
> = {
  /**
   * The id of the chat.
   */
  readonly id: string;

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
  readonly messages: UIMessage<MESSAGE_METADATA, DATA_TYPES>[];

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
    message: CreateUIMessage<MESSAGE_METADATA>,
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
      | UIMessage<MESSAGE_METADATA, DATA_TYPES>[]
      | ((
          messages: UIMessage<MESSAGE_METADATA, DATA_TYPES>[],
        ) => UIMessage<MESSAGE_METADATA, DATA_TYPES>[]),
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

export function useChat<
  MESSAGE_METADATA = unknown,
  DATA_TYPES extends Record<string, unknown> = Record<string, unknown>,
>({
  id,
  initialInput = '',
  onToolCall,
  onFinish,
  onError,
  generateId = generateIdFunc,
  experimental_throttle: throttleWaitMs,
  chatStore: chatStoreArg,
}: UseChatOptions<MESSAGE_METADATA> & {
  /**
Custom throttle wait in ms for the chat messages and data updates.
Default is undefined, which disables throttling.
   */
  experimental_throttle?: number;
} = {}): UseChatHelpers<MESSAGE_METADATA, DATA_TYPES> {
  // Generate ID once, store in state for stability across re-renders
  const [hookId] = useState(generateId);

  // Use the caller-supplied ID if available; otherwise, fall back to our stable ID
  const chatId = id ?? hookId;

  // chat store setup
  // TODO enable as arg
  const chatStore = useRef(
    chatStoreArg ??
      defaultChatStore<MESSAGE_METADATA>({
        api: '/api/chat',
        generateId,
      }),
  );

  // ensure the chat is in the store
  if (!chatStore.current.hasChat(chatId)) {
    chatStore.current.addChat(chatId, []);
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
          if (event.chatId !== chatId || event.type !== eventType) {
            return;
          }

          onStoreChange();
        },
      });
    },
    [chatStore, chatId],
  );

  const addToolResult = useCallback(
    (
      options: Omit<
        Parameters<ChatStore<MESSAGE_METADATA>['addToolResult']>[0],
        'chatId'
      >,
    ) => chatStore.current.addToolResult({ chatId, ...options }),
    [chatStore, chatId],
  );

  const stopStream = useCallback(() => {
    chatStore.current.stopStream({ chatId });
  }, [chatStore, chatId]);

  const error = useSyncExternalStore(
    callback =>
      subscribe({
        onStoreChange: callback,
        eventType: 'chat-status-changed',
      }),
    () => chatStore.current.getError(chatId),
    () => chatStore.current.getError(chatId),
  );

  const status = useSyncExternalStore(
    callback =>
      subscribe({
        onStoreChange: callback,
        eventType: 'chat-status-changed',
      }),
    () => chatStore.current.getStatus(chatId),
    () => chatStore.current.getStatus(chatId),
  );

  const messages = useSyncExternalStore(
    callback => {
      return subscribe({
        onStoreChange: callback,
        eventType: 'chat-messages-changed',
      });
    },
    () => chatStore.current.getMessages(chatId),
    () => chatStore.current.getMessages(chatId),
  );

  const append = useCallback(
    (
      message: CreateUIMessage<MESSAGE_METADATA>,
      { headers, body }: ChatRequestOptions = {},
    ) =>
      chatStore.current.submitMessage({
        chatId,
        message,
        headers,
        body,
        onError,
        onToolCall,
        onFinish,
      }),
    [chatStore, chatId, onError, onToolCall, onFinish],
  );

  const reload = useCallback(
    async ({ headers, body }: ChatRequestOptions = {}) =>
      chatStore.current.resubmitLastUserMessage({
        chatId,
        headers,
        body,
        onError,
        onToolCall,
        onFinish,
      }),
    [chatStore, chatId, onError, onToolCall, onFinish],
  );
  const stop = useCallback(() => stopStream(), [stopStream]);

  const experimental_resume = useCallback(
    async () =>
      chatStore.current.resumeStream({
        chatId,
        onError,
        onToolCall,
        onFinish,
      }),
    [chatStore, chatId, onError, onToolCall, onFinish],
  );

  const setMessages = useCallback(
    (
      messagesParam:
        | UIMessage<MESSAGE_METADATA>[]
        | ((
            messages: UIMessage<MESSAGE_METADATA>[],
          ) => UIMessage<MESSAGE_METADATA>[]),
    ) => {
      if (typeof messagesParam === 'function') {
        messagesParam = messagesParam(messages);
      }

      chatStore.current.setMessages({
        id: chatId,
        messages: messagesParam,
      });
    },
    [chatId, messages],
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
    [input, generateId, append, messages],
  );

  const handleInputChange = (e: any) => {
    setInput(e.target.value);
  };

  return {
    messages,
    id: chatId,
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
