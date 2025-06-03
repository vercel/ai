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
import { ChatStatus, ChatStoreSubscriber } from '../../ai/src/ui/chat-store';

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
  reload: (chatRequestOptions?: ChatRequestOptions) => Promise<void>;

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

type ExtendedCallOptions<
  MESSAGE_METADATA,
  DATA_PART_SCHEMAS extends UIDataPartSchemas,
> = ChatRequestOptions & {
  onError?: (error: Error) => void;

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
    message: UIMessage<MESSAGE_METADATA, InferUIDataParts<DATA_PART_SCHEMAS>>;
  }) => void;
};

export type Chat2<
  MESSAGE_METADATA = unknown,
  DATA_PART_SCHEMAS extends UIDataPartSchemas = UIDataPartSchemas,
> = {
  id: string;
  status: ChatStatus;
  messages: UIMessage<MESSAGE_METADATA, InferUIDataParts<DATA_PART_SCHEMAS>>[];

  // TODO simplified subscriber
  subscribe(subscriber: ChatStoreSubscriber): () => void;

  addToolResult({
    toolCallId,
    result,
  }: {
    toolCallId: string;
    result: unknown;
  }): Promise<void>;

  stopStream(): Promise<void>;

  submitMessage({
    message,
    headers,
    body,
    onError,
    onToolCall,
    onFinish,
  }: ExtendedCallOptions<MESSAGE_METADATA, DATA_PART_SCHEMAS> & {
    message: CreateUIMessage<
      MESSAGE_METADATA,
      InferUIDataParts<DATA_PART_SCHEMAS>
    >;
  }): Promise<void>;

  resubmitLastUserMessage({
    headers,
    body,
    onError,
    onToolCall,
    onFinish,
  }: ExtendedCallOptions<MESSAGE_METADATA, DATA_PART_SCHEMAS>): Promise<void>;

  resumeStream({
    headers,
    body,
    onError,
    onToolCall,
    onFinish,
  }: ExtendedCallOptions<MESSAGE_METADATA, DATA_PART_SCHEMAS>): Promise<void>;

  setMessages({
    messages,
  }: {
    messages: UIMessage<
      MESSAGE_METADATA,
      InferUIDataParts<DATA_PART_SCHEMAS>
    >[];
  }): Promise<void>;
};

export type UseChatOptions2<
  MESSAGE_METADATA = unknown,
  DATA_TYPE_SCHEMAS extends UIDataPartSchemas = UIDataPartSchemas,
> = {
  chat: Chat2<MESSAGE_METADATA, DATA_TYPE_SCHEMAS>;

  /**
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
};

export function useChat2<
  MESSAGE_METADATA = unknown,
  DATA_PART_SCHEMAS extends UIDataPartSchemas = UIDataPartSchemas,
>({
  chat,
  initialInput = '',
  onToolCall,
  onFinish,
  onError,
  generateId = generateIdFunc,
  experimental_throttle: throttleWaitMs,
}: UseChatOptions2<MESSAGE_METADATA, DATA_PART_SCHEMAS> & {
  /**
Custom throttle wait in ms for the chat messages and data updates.
Default is undefined, which disables throttling.
   */
  experimental_throttle?: number;
}): UseChatHelpers2<MESSAGE_METADATA, DATA_PART_SCHEMAS> {
  const chatRef = useRef(chat);

  const subscribe = useCallback(
    ({
      onStoreChange,
      eventType,
    }: {
      onStoreChange: () => void;
      eventType: ChatStoreEvent['type'];
    }) =>
      chatRef.current.subscribe({
        onChatChanged: event => {
          if (event.chatId !== chatRef.current.id || event.type !== eventType)
            return;
          onStoreChange();
        },
      }),
    [chatRef],
  );

  const addToolResult = useCallback(
    (
      options: Parameters<
        Chat2<MESSAGE_METADATA, DATA_PART_SCHEMAS>['addToolResult']
      >[0],
    ) => chatRef.current.addToolResult(options),
    [chatRef],
  );

  const stopStream = useCallback(() => {
    chatRef.current.stopStream();
  }, [chatRef]);

  const status = useSyncExternalStore(
    callback =>
      subscribe({
        onStoreChange: callback,
        eventType: 'chat-status-changed',
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
        eventType: 'chat-messages-changed',
      });
    },
    [subscribe, throttleWaitMs],
  );

  const messages = useSyncExternalStore(
    callback => subscribeToChatStoreForMessages(callback),
    () => chatRef.current.messages,
    () => chatRef.current.messages,
  );

  const append = useCallback(
    (
      message: CreateUIMessage<
        MESSAGE_METADATA,
        InferUIDataParts<DATA_PART_SCHEMAS>
      >,
      { headers, body }: ChatRequestOptions = {},
    ) =>
      chatRef.current.submitMessage({
        message,
        headers,
        body,
        onError,
        onToolCall,
        onFinish,
      }),
    [chatRef, onError, onToolCall, onFinish],
  );

  const reload = useCallback(
    async ({ headers, body }: ChatRequestOptions = {}) =>
      chatRef.current.resubmitLastUserMessage({
        headers,
        body,
        onError,
        onToolCall,
        onFinish,
      }),
    [chatRef, onError, onToolCall, onFinish],
  );
  const stop = useCallback(() => stopStream(), [stopStream]);

  const experimental_resume = useCallback(
    async () =>
      chatRef.current.resumeStream({
        onError,
        onToolCall,
        onFinish,
      }),
    [chatRef, onError, onToolCall, onFinish],
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

      chatRef.current.setMessages({
        messages: messagesParam,
      });
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
    chatId: chatRef.current.id,
    setMessages,
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

export function createChat2<
  MESSAGE_METADATA = unknown,
  UI_DATA_PART_SCHEMAS extends UIDataPartSchemas = UIDataPartSchemas,
>(
  chat: {
    id: string;
    messages: UIMessage<
      MESSAGE_METADATA,
      InferUIDataParts<UI_DATA_PART_SCHEMAS>
    >[];
  } & Omit<ChatStoreOptions<MESSAGE_METADATA, UI_DATA_PART_SCHEMAS>, 'chats'>,
): Chat2<MESSAGE_METADATA, UI_DATA_PART_SCHEMAS> {
  const { id, messages, ...options } = chat;
  const store = createChatStore<MESSAGE_METADATA, UI_DATA_PART_SCHEMAS>({
    ...options,
    chats: {
      [chat.id]: {
        messages: chat.messages ?? [],
      },
    },
  });

  return {
    id: chat.id,
    status: store.getStatus(chat.id),
    get messages() {
      return store.getMessages(chat.id);
    },
    subscribe: options => store.subscribe(options),
    addToolResult: options =>
      store.addToolResult({ chatId: chat.id, ...options }),
    stopStream: () => store.stopStream({ chatId: chat.id }),
    submitMessage: options =>
      store.submitMessage({ chatId: chat.id, ...options }),
    resubmitLastUserMessage: async options => {
      await store.resubmitLastUserMessage({
        chatId: chat.id,
        ...options,
      });
    },
    resumeStream: async options => {
      await store.resumeStream({ chatId: chat.id, ...options });
    },
    setMessages: async ({ messages }) => {
      store.setMessages({ id: chat.id, messages });
    },
  };
}
