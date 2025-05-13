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
  DefaultChatStoreBackend,
  generateId as generateIdFunc,
  isAssistantMessageWithCompletedToolCalls,
  updateToolCallResult,
} from 'ai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useChatStore } from './use-chat-store';
import { useStableValue } from './util/use-stable-value';

export type { CreateUIMessage, UIMessage, UseChatOptions };

export type UseChatHelpers<MESSAGE_METADATA = unknown> = {
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
  readonly messages: UIMessage<MESSAGE_METADATA>[];

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
      | UIMessage<MESSAGE_METADATA>[]
      | ((
          messages: UIMessage<MESSAGE_METADATA>[],
        ) => UIMessage<MESSAGE_METADATA>[]),
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

export function useChat<MESSAGE_METADATA>({
  api = '/api/chat',
  id,
  initialMessages,
  initialInput = '',
  onToolCall,
  experimental_prepareRequestBody,
  maxSteps = 1,
  streamProtocol = 'ui-message',
  onFinish,
  onError,
  credentials,
  headers,
  body,
  generateId = generateIdFunc,
  fetch,
  experimental_throttle: throttleWaitMs,
  messageMetadataSchema,
}: UseChatOptions<MESSAGE_METADATA> & {
  /**
   * Experimental (React only). When a function is provided, it will be used
   * to prepare the request body for the chat API. This can be useful for
   * customizing the request body based on the messages and data in the chat.
   *
   * @param id The id of the chat.
   * @param messages The current messages in the chat.
   * @param requestBody The request body object passed in the chat request.
   */
  experimental_prepareRequestBody?: (options: {
    id: string;
    messages: UIMessage<MESSAGE_METADATA>[];
    requestBody?: object;
  }) => unknown;

  /**
Custom throttle wait in ms for the chat messages and data updates.
Default is undefined, which disables throttling.
   */
  experimental_throttle?: number;
} = {}): UseChatHelpers<MESSAGE_METADATA> {
  // Generate ID once, store in state for stability across re-renders
  const [hookId] = useState(generateId);

  // Use the caller-supplied ID if available; otherwise, fall back to our stable ID
  const chatId = id ?? hookId;

  // Store array of the processed initial messages to avoid re-renders:
  const stableInitialMessages = useStableValue(initialMessages ?? []);
  const processedInitialMessages = useMemo(
    () => stableInitialMessages,
    [stableInitialMessages],
  );

  // chat store setup
  // TODO enable as arg
  const chatStore = useRef(
    new ChatStore<MESSAGE_METADATA>({
      backend: new DefaultChatStoreBackend<MESSAGE_METADATA>({
        api,
        fetch,
        streamProtocol,
        credentials,
        headers,
        body,
        prepareRequestBody: experimental_prepareRequestBody,
      }),
      generateId,
      messageMetadataSchema,
    }),
  );

  // ensure the chat is in the store
  if (!chatStore.current.hasChat(chatId)) {
    chatStore.current.addChat(chatId, processedInitialMessages ?? []);
  }

  const { messages, error, status } = useChatStore({
    store: chatStore.current,
    chatId,
  });

  // Abort controller to cancel the current API call.
  const abortControllerRef = useRef<AbortController | null>(null);

  const extraMetadataRef = useRef({
    credentials,
    headers,
    body,
  });

  useEffect(() => {
    extraMetadataRef.current = {
      credentials,
      headers,
      body,
    };
  }, [credentials, headers, body]);

  const triggerRequest = useCallback(
    async (
      chatRequest: ChatRequestOptions & {
        messages: UIMessage<MESSAGE_METADATA>[];
      },
      requestType: 'generate' | 'resume' = 'generate',
    ) =>
      chatStore.current.triggerRequest({
        chatId,
        requestType,
        maxSteps,
        body: chatRequest.body,
        headers: chatRequest.headers,
        messages: chatRequest.messages,
        onFinish,
        onError,
        onToolCall,
      }),
    [
      chatId,
      maxSteps,
      extraMetadataRef,
      experimental_prepareRequestBody,
      onFinish,
      onError,
      streamProtocol,
      onToolCall,
      abortControllerRef,
      // throttleWaitMs,
      messageMetadataSchema,
    ],
  );

  const append = useCallback(
    async (
      message: CreateUIMessage<MESSAGE_METADATA>,
      { headers, body }: ChatRequestOptions = {},
    ) => {
      await triggerRequest({
        messages: messages.concat({
          ...message,
          id: message.id ?? generateId(),
        }),
        headers,
        body,
      });
    },
    [triggerRequest, generateId, messages],
  );

  const reload = useCallback(
    async ({ headers, body }: ChatRequestOptions = {}) => {
      if (messages.length === 0) {
        return null;
      }

      // Remove last assistant message and retry last user message.
      const lastMessage = messages[messages.length - 1];
      return triggerRequest({
        messages:
          lastMessage.role === 'assistant' ? messages.slice(0, -1) : messages,
        headers,
        body,
      });
    },
    [triggerRequest, messages],
  );

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const experimental_resume = useCallback(async () => {
    triggerRequest({ messages }, 'resume');
  }, [triggerRequest, messages]);

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
      metadata?: Object,
    ) => {
      event?.preventDefault?.();

      const fileParts = Array.isArray(options?.files)
        ? options.files
        : await convertFileListToFileUIParts(options?.files);

      if (!input && fileParts.length === 0) return;

      if (metadata) {
        extraMetadataRef.current = {
          ...extraMetadataRef.current,
          ...metadata,
        };
      }

      triggerRequest({
        messages: messages.concat({
          id: generateId(),
          role: 'user',
          metadata: undefined,
          parts: [...fileParts, { type: 'text', text: input }],
        }),
        headers: options.headers,
        body: options.body,
      });

      setInput('');
    },
    [input, generateId, triggerRequest, messages],
  );

  const handleInputChange = (e: any) => {
    setInput(e.target.value);
  };

  const addToolResult = useCallback(
    ({ toolCallId, result }: { toolCallId: string; result: unknown }) => {
      const currentMessages = messages;

      updateToolCallResult({
        messages: currentMessages,
        toolCallId,
        toolResult: result,
      });

      // array mutation is required to trigger a re-render
      chatStore.current.setMessages({
        id: chatId,
        messages: [
          ...currentMessages.slice(0, currentMessages.length - 1),
          {
            ...currentMessages[currentMessages.length - 1],
            // @ts-ignore
            // update the revisionId to trigger a re-render
            revisionId: generateId(),
          },
        ],
      });

      // when the request is ongoing, the auto-submit will be triggered after the request is finished
      if (status === 'submitted' || status === 'streaming') {
        return;
      }

      // auto-submit when all tool calls in the last assistant message have results:
      const lastMessage = currentMessages[currentMessages.length - 1];
      if (isAssistantMessageWithCompletedToolCalls(lastMessage)) {
        triggerRequest({ messages: currentMessages });
      }
    },
    [status, triggerRequest, generateId, chatId, messages],
  );

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
