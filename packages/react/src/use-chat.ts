import type {
  ChatRequest,
  ChatRequestOptions,
  CreateMessage,
  JSONValue,
  Message,
  UIMessage,
  UseChatOptions,
} from '@ai-sdk/ui-utils';
import type { BasicDataStreamWriter } from 'ai';
import {
  callChatApi,
  extractMaxToolInvocationStep,
  fillMessageParts,
  generateId as generateIdFunc,
  getMessageParts,
  isAssistantMessageWithCompletedToolCalls,
  prepareAttachmentsForRequest,
  shouldResubmitMessages,
  updateToolCallResult,
  formatDataStreamPart,
} from '@ai-sdk/ui-utils';
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import useSWR from 'swr';
import { throttle } from './throttle';

export type { CreateMessage, Message, UseChatOptions };

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
    message: Message | CreateMessage,
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
   * Update the `messages` state locally. This is useful when you want to
   * edit the messages on the client, and then trigger the `reload` method
   * manually to regenerate the AI response.
   */
  setMessages: (
    messages: Message[] | ((messages: Message[]) => Message[]),
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
    chatRequestOptions?: ChatRequestOptions,
  ) => void;
  metadata?: Object;
  /** Whether the API request is in progress */
  isLoading: boolean;

  /** Additional data added on the server via StreamData. */
  data?: JSONValue[];
  /** Set the data of the chat. You can use this to transform or clear the chat data. */
  setData: (
    data:
      | JSONValue[]
      | undefined
      | ((data: JSONValue[] | undefined) => JSONValue[] | undefined),
  ) => void;

  /** The data stream writer that can be used to write data during tool execution. */
  dataStream: BasicDataStreamWriter;

  /** The id of the chat */
  id: string;
};

export function useChat({
  api = '/api/chat',
  id,
  initialMessages,
  initialInput = '',
  sendExtraMessageFields,
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
  keepLastMessageOnError = true,
  experimental_throttle: throttleWaitMs,
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

  /**
Maximum number of sequential LLM calls (steps), e.g. when you use tool calls.
Must be at least 1.

A maximum number is required to prevent infinite loops in the case of misconfigured tools.

By default, it's set to 1, which means that only a single LLM call is made.
 */
  maxSteps?: number;
} = {}): UseChatHelpers & {
  addToolResult: ({
    toolCallId,
    result,
  }: {
    toolCallId: string;
    result: any;
  }) => void;
} {
  // Generate ID once, store in state for stability across re-renders
  const [hookId] = useState(generateId);

  // Use the caller-supplied ID if available; otherwise, fall back to our stable ID
  const chatId = id ?? hookId;
  const chatKey = typeof api === 'string' ? [api, chatId] : chatId;

  // Store a empty array as the initial messages
  // (instead of using a default parameter value that gets re-created each time)
  // to avoid re-renders:
  const [initialMessagesFallback] = useState([]);

  // Store the chat state in SWR, using the chatId as the key to share states.
  const { data: messages, mutate } = useSWR<UIMessage[]>(
    [chatKey, 'messages'],
    null,
    {
      fallbackData:
        initialMessages != null
          ? fillMessageParts(initialMessages)
          : initialMessagesFallback,
    },
  );

  // Keep the latest messages in a ref.
  const messagesRef = useRef<UIMessage[]>(messages || []);
  useEffect(() => {
    messagesRef.current = messages || [];
  }, [messages]);

  // stream data
  const { data: streamData, mutate: mutateStreamData } = useSWR<
    JSONValue[] | undefined
  >([chatKey, 'streamData'], null);

  // keep the latest stream data in a ref
  const streamDataRef = useRef<JSONValue[] | undefined>(streamData);
  useEffect(() => {
    streamDataRef.current = streamData;
  }, [streamData]);

  // We store loading state in another hook to sync loading states across hook invocations
  const { data: isLoading = false, mutate: mutateLoading } = useSWR<boolean>(
    [chatKey, 'loading'],
    null,
  );

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
    async (chatRequest: ChatRequest) => {
      const chatMessages = fillMessageParts(chatRequest.messages);

      const messageCount = chatMessages.length;
      const maxStep = extractMaxToolInvocationStep(
        chatMessages[chatMessages.length - 1]?.toolInvocations,
      );

      try {
        mutateLoading(true);
        setError(undefined);

        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        const throttledMutate = throttle(mutate, throttleWaitMs);
        const throttledMutateStreamData = throttle(
          mutateStreamData,
          throttleWaitMs,
        );

        // Do an optimistic update to the chat state to show the updated messages immediately:
        const previousMessages = messagesRef.current;
        throttledMutate(chatMessages, false);

        const constructedMessagesPayload = sendExtraMessageFields
          ? chatMessages
          : chatMessages.map(
              ({
                role,
                content,
                experimental_attachments,
                data,
                annotations,
                toolInvocations,
                parts,
              }) => ({
                role,
                content,
                ...(experimental_attachments !== undefined && {
                  experimental_attachments,
                }),
                ...(data !== undefined && { data }),
                ...(annotations !== undefined && { annotations }),
                ...(toolInvocations !== undefined && { toolInvocations }),
                ...(parts !== undefined && { parts }),
              }),
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
            messages: constructedMessagesPayload,
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
          restoreMessagesOnFailure() {
            if (!keepLastMessageOnError) {
              throttledMutate(previousMessages, false);
            }
          },
          onResponse,
          onUpdate({ message, data, replaceLastMessage }) {
            throttledMutate(
              [
                ...(replaceLastMessage
                  ? chatMessages.slice(0, chatMessages.length - 1)
                  : chatMessages),
                message,
              ],
              false,
            );

            if (data?.length) {
              throttledMutateStreamData(
                [...(existingData ?? []), ...data],
                false,
              );
            }
          },
          onToolCall,
          onFinish,
          generateId,
          fetch,
          lastMessage: chatMessages[chatMessages.length - 1],
        });

        abortControllerRef.current = null;
      } catch (err) {
        // Ignore abort errors as they are expected.
        if ((err as any).name === 'AbortError') {
          abortControllerRef.current = null;
          return null;
        }

        if (onError && err instanceof Error) {
          onError(err);
        }

        setError(err as Error);
      } finally {
        mutateLoading(false);
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
      mutateLoading,
      api,
      extraMetadataRef,
      onResponse,
      onFinish,
      onError,
      setError,
      mutateStreamData,
      streamDataRef,
      streamProtocol,
      sendExtraMessageFields,
      experimental_prepareRequestBody,
      onToolCall,
      maxSteps,
      messagesRef,
      abortControllerRef,
      generateId,
      fetch,
      keepLastMessageOnError,
      throttleWaitMs,
      chatId,
    ],
  );

  const append = useCallback(
    async (
      message: Message | CreateMessage,
      {
        data,
        headers,
        body,
        experimental_attachments,
      }: ChatRequestOptions = {},
    ) => {
      const attachmentsForRequest = await prepareAttachmentsForRequest(
        experimental_attachments,
      );

      const messages = messagesRef.current.concat({
        ...message,
        id: message.id ?? generateId(),
        createdAt: message.createdAt ?? new Date(),
        experimental_attachments:
          attachmentsForRequest.length > 0 ? attachmentsForRequest : undefined,
        parts: getMessageParts(message),
      });

      return triggerRequest({ messages, headers, body, data });
    },
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

  const setMessages = useCallback(
    (messages: Message[] | ((messages: Message[]) => Message[])) => {
      if (typeof messages === 'function') {
        messages = messages(messagesRef.current);
      }

      const messagesWithParts = fillMessageParts(messages);
      mutate(messagesWithParts, false);
      messagesRef.current = messagesWithParts;
    },
    [mutate],
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
      options: ChatRequestOptions = {},
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

      const attachmentsForRequest = await prepareAttachmentsForRequest(
        options.experimental_attachments,
      );

      const messages = messagesRef.current.concat({
        id: generateId(),
        createdAt: new Date(),
        role: 'user',
        content: input,
        experimental_attachments:
          attachmentsForRequest.length > 0 ? attachmentsForRequest : undefined,
        parts: [{ type: 'text', text: input }],
      });

      const chatRequest: ChatRequest = {
        messages,
        headers: options.headers,
        body: options.body,
        data: options.data,
      };

      triggerRequest(chatRequest);

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

      mutate(currentMessages, false);

      // auto-submit when all tool calls in the last assistant message have results:
      const lastMessage = currentMessages[currentMessages.length - 1];
      if (isAssistantMessageWithCompletedToolCalls(lastMessage)) {
        triggerRequest({ messages: currentMessages });
      }
    },
    [mutate, triggerRequest],
  );

  // Create a data stream writer that matches the core API (minus merge/onError)
  const dataStream = useMemo<BasicDataStreamWriter>(
    () => ({
      writeData(data: JSONValue) {
        setData(currentData => [
          ...(currentData || []),
          formatDataStreamPart('data', [data]),
        ]);
      },
      writeMessageAnnotation(annotation: JSONValue) {
        setData(currentData => [
          ...(currentData || []),
          formatDataStreamPart('message_annotations', [annotation]),
        ]);
      },
    }),
    [setData],
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
    input,
    setInput,
    handleInputChange,
    handleSubmit,
    isLoading,
    dataStream,
    addToolResult,
  };
}
