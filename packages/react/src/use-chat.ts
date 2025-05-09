import type {
  ChatRequestOptions,
  CreateUIMessage,
  FileUIPart,
  JSONValue,
  UIMessage,
  UseChatOptions,
} from 'ai';
import {
  callChatApi,
  ChatStore,
  ChatStoreEvent,
  convertFileListToFileUIParts,
  extractMaxToolInvocationStep,
  generateId as generateIdFunc,
  getToolInvocations,
  isAssistantMessageWithCompletedToolCalls,
  shouldResubmitMessages,
} from 'ai';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import useSWR from 'swr';
import { throttle } from './throttle';
import { useStableValue } from './util/use-stable-value';

export type { CreateUIMessage, UIMessage, UseChatOptions };

export type UseChatHelpers = {
  /** Current messages in the chat */
  messages: UIMessage[];
  /** The error object of the API request */
  error: undefined | Error;
  /**
   * Append a user message to the chat list. This triggers the API call to fetch
   * the assistant's response.
   * @param message The message to append
   * @param options Additional options to pass to the API call
   */
  append: (
    message: UIMessage | CreateUIMessage,
    chatRequestOptions?: ChatRequestOptions,
  ) => Promise<string | null | undefined>;
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
    messages: UIMessage[] | ((messages: UIMessage[]) => UIMessage[]),
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
  metadata?: Object;

  /**
   * Whether the API request is in progress
   *
   * @deprecated use `status` instead
   */
  isLoading: boolean;

  /**
   * Hook status:
   *
   * - `submitted`: The message has been sent to the API and we're awaiting the start of the response stream.
   * - `streaming`: The response is actively streaming in from the API, receiving chunks of data.
   * - `ready`: The full response has been received and processed; a new user message can be submitted.
   * - `error`: An error occurred during the API request, preventing successful completion.
   */
  status: 'submitted' | 'streaming' | 'ready' | 'error';

  /** Additional data added on the server via StreamData. */
  data?: JSONValue[];

  /** Set the data of the chat. You can use this to transform or clear the chat data. */
  setData: (
    data:
      | JSONValue[]
      | undefined
      | ((data: JSONValue[] | undefined) => JSONValue[] | undefined),
  ) => void;

  addToolResult: ({
    toolCallId,
    result,
  }: {
    toolCallId: string;
    result: any;
  }) => Promise<void>;

  /** The id of the chat */
  id: string;
};

const EMPTY_MESSAGES: UIMessage[] = [];

export function useChat({
  api = '/api/chat',
  id,
  store,
  initialMessages,
  initialInput = '',
  onToolCall,
  experimental_prepareRequestBody,
  maxSteps = 1,
  streamProtocol = 'data',
  onResponse,
  onFinish,
  onError,
  credentials,
  headers,
  body,
  generateId = generateIdFunc,
  fetch,
  experimental_throttle: throttleWaitMs,
  ...options
}: UseChatOptions & {
  key?: string;

  /**
   * Experimental (React only). When a function is provided, it will be used
   * to prepare the request body for the chat API. This can be useful for
   * customizing the request body based on the messages and data in the chat.
   *
   * @param messages The current messages in the chat.
   * @param requestData The data object passed in the chat request.
   * @param requestBody The request body object passed in the chat request.
   */
  experimental_prepareRequestBody?: (options: {
    id: string;
    messages: UIMessage[];
    requestData?: JSONValue;
    requestBody?: object;
  }) => unknown;

  /**
Custom throttle wait in ms for the chat messages and data updates.
Default is undefined, which disables throttling.
   */
  experimental_throttle?: number;

  '~internal'?: {
    currentDate?: () => Date;
  };
} = {}): UseChatHelpers {
  // allow overriding the current date for testing purposes:
  const getCurrentDate = useCallback(() => {
    return options['~internal']?.currentDate?.() ?? new Date();
  }, [options]);

  // Generate ID once, store in state for stability across re-renders
  const [hookId] = useState(generateId);

  // Use the caller-supplied ID if available; otherwise, fall back to our stable ID
  const chatId = id ?? hookId;
  const chatKey = typeof api === 'string' ? [api, chatId] : chatId;

  // Store array of the processed initial messages to avoid re-renders:
  const stableInitialMessages = useStableValue(
    initialMessages ?? [],
  );
  const processedInitialMessages = useMemo(
    () => stableInitialMessages,
    [stableInitialMessages],
  );

  const chatStore = useMemo(
    () => {
      if (store) {
        if (!store.hasChat(chatId)) {
          store.addChat(chatId, processedInitialMessages);
        }
        return store;
      }

      return new ChatStore({
        chats: { [chatId]: { messages: processedInitialMessages } },
        generateId,
        getCurrentDate,
      });
    },
    [store, chatId, processedInitialMessages, generateId, getCurrentDate],
  );

  const messages = useSyncExternalStore(
    cb =>
      chatStore.subscribe({
        id: chatId,
        onChatChanged: e => {
          if (e === ChatStoreEvent.ChatMessagesChanged) {
            cb();
          }
        },
      }),
    () => chatStore.getMessages(chatId) ?? EMPTY_MESSAGES,
    () => processedInitialMessages,
  );
  const status: 'submitted' | 'streaming' | 'ready' | 'error' = useSyncExternalStore(
    cb =>
      chatStore.subscribe({
        id: chatId,
        onChatChanged: e => {
          if (e === ChatStoreEvent.ChatStatusChanged) {
            cb();
          }
        },
      }),
    () => chatStore.getStatus(chatId) ?? 'ready',
    () => 'ready',
  );
  const error = useSyncExternalStore(
    cb =>
      chatStore.subscribe({
        id: chatId,
        onChatChanged: e => {
          if (e === ChatStoreEvent.ChatErrorChanged) {
            cb();
          }
        },
      }),
    () => chatStore.getError(chatId),
    () => undefined,
  );

  // Stream data
  const { data: streamData, mutate: mutateStreamData } = useSWR<
    JSONValue[] | undefined
  >([chatKey, 'streamData'], null);

  // Keep the latest stream data in a ref
  const streamDataRef = useRef<JSONValue[] | undefined>(streamData);
  useEffect(() => {
    streamDataRef.current = streamData;
  }, [streamData]);

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
    async ({
      chatRequest = {},
      requestType = 'generate',
    }: {
      chatRequest?: {
        headers?: Record<string, string> | Headers;
        body?: object;
        data?: JSONValue;
      };
      requestType?: 'generate' | 'resume';
    } = {}) => {
      chatStore.setStatus({ id: chatId, status: 'submitted' });
      chatStore.setError({ id: chatId, error: undefined });

      const chatMessages = chatStore.getMessages(chatId) ?? [];

      const messageCount = chatMessages.length;
      const maxStep = extractMaxToolInvocationStep(
        getToolInvocations(chatMessages[chatMessages.length - 1]),
      );

      try {
        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        const throttledMutateStreamData = throttle(
          mutateStreamData,
          throttleWaitMs,
        );

        const existingData = streamDataRef.current;

        await callChatApi({
          api,
          body: experimental_prepareRequestBody?.({
            id: chatId,
            messages: chatMessages,
            requestData: chatRequest.data,
            requestBody: chatRequest.body,
          }) ?? {
            id: chatId,
            messages: chatMessages,
            data: chatRequest.data,
            ...extraMetadataRef.current.body,
            ...chatRequest.body,
          },
          streamProtocol,
          credentials: extraMetadataRef.current.credentials,
          headers: {
            ...extraMetadataRef.current.headers,
            ...chatRequest.headers,
          },
          abortController: () => abortControllerRef.current,
          onResponse,
          onUpdateData(data) {
            if (data?.length) {
              throttledMutateStreamData(
                [...(existingData ?? []), ...data],
                false,
              );
            }
          },
          onToolCall,
          onFinish,
          fetch,
          requestType,
          store: chatStore,
        });

        abortControllerRef.current = null;

        chatStore.setStatus({ id: chatId, status: 'ready' });
      } catch (err) {
        // Ignore abort errors as they are expected.
        if ((err as any).name === 'AbortError') {
          abortControllerRef.current = null;
          chatStore.setStatus({ id: chatId, status: 'ready' });
          return null;
        }

        if (onError && err instanceof Error) {
          onError(err);
        }

        chatStore.setError({ id: chatId, error: err as Error });
        chatStore.setStatus({ id: chatId, status: 'error' });
      }

      // auto-submit when all tool calls in the last assistant message have results
      // and assistant has not answered yet
      const messages = chatStore.getMessages(chatId) ?? [];
      if (
        shouldResubmitMessages({
          originalMaxToolInvocationStep: maxStep,
          originalMessageCount: messageCount,
          maxSteps,
          messages,
        })
      ) {
        await triggerRequest();
      }
    },
    [chatStore, chatId, maxSteps, mutateStreamData, throttleWaitMs, api, experimental_prepareRequestBody, streamProtocol, onResponse, onToolCall, onFinish, fetch, onError],
  );

  const append = useCallback(
    (
      message: UIMessage | CreateUIMessage,
      { data, headers, body }: ChatRequestOptions = {},
    ) => {
      chatStore.appendMessage({
        id: chatId,
        message: {
          ...message,
          id: message.id ?? generateId(),
          createdAt: message.createdAt ?? getCurrentDate(),
        },
      });

      return triggerRequest({
        chatRequest: {
          headers,
          body,
          data,
        },
      });
    },
    [chatStore, chatId, generateId, getCurrentDate, triggerRequest],
  );

  const reload = useCallback(
    async ({ data, headers, body }: ChatRequestOptions = {}) => {
      const messages = chatStore.getMessages(chatId) ?? [];

      if (messages.length === 0) {
        return null;
      }

      chatStore.removeAssistantResponse(chatId);

      // Remove last assistant message and retry last user message.
      return triggerRequest({
        chatRequest: {
          headers,
          body,
          data,
        },
      });
    },
    [chatStore, chatId, triggerRequest],
  );

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const experimental_resume = useCallback(async () => {
    triggerRequest({
      requestType: 'resume',
    });
  }, [triggerRequest]);

  const setMessages = useCallback(
    (messages: UIMessage[] | ((messages: UIMessage[]) => UIMessage[])) => {
      if (typeof messages === 'function') {
        messages = messages(chatStore.getMessages(chatId) ?? []);
      }

      chatStore.setMessages({
        id: chatId,
        messages,
      });
    },
    [chatStore, chatId],
  );

  const setData = useCallback(
    (
      data:
        | JSONValue[]
        | undefined
        | ((data: JSONValue[] | undefined) => JSONValue[] | undefined),
    ) => {
      if (typeof data === 'function') {
        data = data(streamDataRef.current);
      }

      mutateStreamData(data, false);
      streamDataRef.current = data;
    },
    [mutateStreamData],
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

      if (!input && !options.allowEmptySubmit) return;

      if (metadata) {
        extraMetadataRef.current = {
          ...extraMetadataRef.current,
          ...metadata,
        };
      }

      const fileParts = Array.isArray(options?.files)
        ? options.files
        : await convertFileListToFileUIParts(options?.files);

      chatStore.appendMessage({
        id: chatId,
        message: {
          id: generateId(),
          createdAt: getCurrentDate(),
          role: 'user',
          parts: [...fileParts, { type: 'text', text: input }],
        },
      });

      triggerRequest({
        chatRequest: {
          headers: options.headers,
          body: options.body,
          data: options.data,
        },
      });

      setInput('');
    },
    [input, chatStore, chatId, generateId, getCurrentDate, triggerRequest],
  );

  const handleInputChange = (e: any) => {
    setInput(e.target.value);
  };

  const addToolResult = useCallback(
    async ({ toolCallId, result }: { toolCallId: string; result: unknown }) => {
      await chatStore.addOrUpdateAssistantMessageParts({
        chatId,
        partDelta: {
          type: 'tool-invocation',
          toolInvocation: {
            toolCallId,
            result,
            state: 'result',
            toolName: '',
            args: undefined,
          },
        },
      });

      // When the request is ongoing, the auto-submit will be triggered after the request is finished
      if (status === 'submitted' || status === 'streaming') {
        return;
      }

      // auto-submit when all tool calls in the last assistant message have results:
      const lastMessage = chatStore.getLastMessage(chatId);
      if (
        lastMessage &&
        isAssistantMessageWithCompletedToolCalls(lastMessage)
      ) {
        triggerRequest();
      }
    },
    [status, triggerRequest, chatStore, chatId],
  );

  return {
    messages: messages ?? [],
    id: chatId,
    setMessages,
    data: streamData,
    setData,
    error,
    append,
    reload,
    stop,
    experimental_resume,
    input,
    setInput,
    handleInputChange,
    handleSubmit,
    isLoading: status === 'submitted' || status === 'streaming',
    status,
    addToolResult,
  };
}
