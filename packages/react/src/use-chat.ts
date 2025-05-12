import type {
  ChatRequestOptions,
  CreateUIMessage,
  FileUIPart,
  JSONValue,
  Schema,
  UIMessage,
  UseChatOptions,
} from 'ai';
import {
  callChatApi,
  convertFileListToFileUIParts,
  extractMaxToolInvocationStep,
  generateId as generateIdFunc,
  getToolInvocations,
  isAssistantMessageWithCompletedToolCalls,
  shouldResubmitMessages,
  updateToolCallResult,
} from 'ai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { throttle } from './throttle';
import { useStableValue } from './util/use-stable-value';

export type { CreateUIMessage, UIMessage, UseChatOptions };

export type UseChatHelpers<MESSAGE_METADATA> = {
  /** Current messages in the chat */
  messages: UIMessage<MESSAGE_METADATA>[];
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

  addToolResult: ({
    toolCallId,
    result,
  }: {
    toolCallId: string;
    result: any;
  }) => void;

  /** The id of the chat */
  id: string;
};

export function useChat<MESSAGE_METADATA>({
  api = '/api/chat',
  id,
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
  messageMetadataSchema,
}: UseChatOptions<MESSAGE_METADATA> & {
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
   * Schema for the message metadata. Validates the message metadata.
   * Message metadata can be undefined or must match the schema.
   */
  messageMetadataSchema?: Schema<MESSAGE_METADATA>;

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
  const chatKey = typeof api === 'string' ? [api, chatId] : chatId;

  // Store array of the processed initial messages to avoid re-renders:
  const stableInitialMessages = useStableValue(initialMessages ?? []);
  const processedInitialMessages = useMemo(
    () => stableInitialMessages,
    [stableInitialMessages],
  );

  // Store the chat state in SWR, using the chatId as the key to share states.
  const { data: messages, mutate } = useSWR<UIMessage[]>(
    [chatKey, 'messages'],
    null,
    { fallbackData: processedInitialMessages },
  );

  // Keep the latest messages in a ref.
  const messagesRef = useRef<UIMessage[]>(messages || []);
  useEffect(() => {
    messagesRef.current = messages || [];
  }, [messages]);

  const { data: status = 'ready', mutate: mutateStatus } = useSWR<
    'submitted' | 'streaming' | 'ready' | 'error'
  >([chatKey, 'status'], null);

  const { data: error = undefined, mutate: setError } = useSWR<
    undefined | Error
  >([chatKey, 'error'], null);

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
      chatRequest: {
        headers?: Record<string, string> | Headers;
        body?: object;
        messages: UIMessage[];
        data?: JSONValue;
      },
      requestType: 'generate' | 'resume' = 'generate',
    ) => {
      mutateStatus('submitted');
      setError(undefined);

      const chatMessages = chatRequest.messages;

      const messageCount = chatMessages.length;
      const maxStep = extractMaxToolInvocationStep(
        getToolInvocations(chatMessages[chatMessages.length - 1]),
      );

      try {
        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        const throttledMutate = throttle(mutate, throttleWaitMs);

        // Do an optimistic update to show the updated messages immediately:
        throttledMutate(chatMessages, false);

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
          onUpdate({ message }) {
            mutateStatus('streaming');

            const replaceLastMessage =
              message.id === chatMessages[chatMessages.length - 1].id;

            throttledMutate(
              [
                ...(replaceLastMessage
                  ? chatMessages.slice(0, chatMessages.length - 1)
                  : chatMessages),
                message,
              ],
              false,
            );
          },
          onToolCall,
          onFinish,
          generateId,
          fetch,
          lastMessage: chatMessages[chatMessages.length - 1],
          requestType,
          messageMetadataSchema,
        });

        abortControllerRef.current = null;

        mutateStatus('ready');
      } catch (err) {
        // Ignore abort errors as they are expected.
        if ((err as any).name === 'AbortError') {
          abortControllerRef.current = null;
          mutateStatus('ready');
          return null;
        }

        if (onError && err instanceof Error) {
          onError(err);
        }

        setError(err as Error);
        mutateStatus('error');
      }

      // auto-submit when all tool calls in the last assistant message have results
      // and assistant has not answered yet
      const messages = messagesRef.current;
      if (
        shouldResubmitMessages({
          originalMaxToolInvocationStep: maxStep,
          originalMessageCount: messageCount,
          maxSteps,
          messages,
        })
      ) {
        await triggerRequest({ messages });
      }
    },
    [
      mutate,
      mutateStatus,
      api,
      extraMetadataRef,
      onResponse,
      onFinish,
      onError,
      setError,
      streamProtocol,
      experimental_prepareRequestBody,
      onToolCall,
      maxSteps,
      messagesRef,
      abortControllerRef,
      generateId,
      fetch,
      throttleWaitMs,
      chatId,
      messageMetadataSchema,
    ],
  );

  const append = useCallback(
    (
      message: UIMessage | CreateUIMessage,
      { data, headers, body }: ChatRequestOptions = {},
    ) =>
      triggerRequest({
        messages: messagesRef.current.concat({
          ...message,
          id: message.id ?? generateId(),
        }),
        headers,
        body,
        data,
      }),
    [triggerRequest, generateId],
  );

  const reload = useCallback(
    async ({ data, headers, body }: ChatRequestOptions = {}) => {
      const messages = messagesRef.current;

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
        data,
      });
    },
    [triggerRequest],
  );

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const experimental_resume = useCallback(async () => {
    const messages = messagesRef.current;

    triggerRequest({ messages }, 'resume');
  }, [triggerRequest]);

  const setMessages = useCallback(
    (messages: UIMessage[] | ((messages: UIMessage[]) => UIMessage[])) => {
      if (typeof messages === 'function') {
        messages = messages(messagesRef.current);
      }

      mutate(messages, false);
      messagesRef.current = messages;
    },
    [mutate],
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

      triggerRequest({
        messages: messagesRef.current.concat({
          id: generateId(),
          role: 'user',
          metadata: undefined,
          parts: [...fileParts, { type: 'text', text: input }],
        }),
        headers: options.headers,
        body: options.body,
        data: options.data,
      });

      setInput('');
    },
    [input, generateId, triggerRequest],
  );

  const handleInputChange = (e: any) => {
    setInput(e.target.value);
  };

  const addToolResult = useCallback(
    ({ toolCallId, result }: { toolCallId: string; result: unknown }) => {
      const currentMessages = messagesRef.current;

      updateToolCallResult({
        messages: currentMessages,
        toolCallId,
        toolResult: result,
      });

      // array mutation is required to trigger a re-render
      mutate(
        [
          ...currentMessages.slice(0, currentMessages.length - 1),
          {
            ...currentMessages[currentMessages.length - 1],
            // @ts-ignore
            // update the revisionId to trigger a re-render
            revisionId: generateId(),
          },
        ],
        false,
      );

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
    [mutate, status, triggerRequest, generateId],
  );

  return {
    messages: messages ?? [],
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
    isLoading: status === 'submitted' || status === 'streaming',
    status,
    addToolResult,
  };
}
