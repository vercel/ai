import type {
  ChatRequest,
  ChatRequestOptions,
  CreateMessage,
  JSONValue,
  Message,
  UIMessage,
  UseChatOptions,
} from 'ai';
import {
  callChatApiV2,
  ChatStore,
  extractMaxToolInvocationStep,
  fillMessageParts,
  generateId as generateIdFunc,
  getMessageParts,
  isAssistantMessageWithCompletedToolCalls,
  prepareAttachmentsForRequest,
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

export type { CreateMessage, Message, UseChatOptions };

export type UseChatHelpers = {
  /** The current messages in the chat */
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

  /** The active chat id */
  id: string;
};

export function useChat({
  api = '/api/chat',
  id,
  chats,
  onChatStoreChange,
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
  const [activeChatId, setActiveChatId] = useState(id ?? hookId);
  const chatKey = useMemo(
    () => (typeof api === 'string' ? [api, activeChatId] : activeChatId),
    [api, activeChatId],
  );

  // Store array of the processed initial messages to avoid re-renders
  const stableInitialMessages = useStableValue(
    chats?.[activeChatId]?.messages ?? [],
  );
  const processedInitialMessages = useMemo(
    () => fillMessageParts(stableInitialMessages),
    [stableInitialMessages],
  );

  const messagesStore = useMemo(
    () => new ChatStore({ chats, onChatStoreChange }),
    [chats, onChatStoreChange],
  );
  const { messages, status, error } = useSyncExternalStore(
    callback =>
      messagesStore.subscribe({
        onChatMessagesChanged: callback,
        onChatStatusChanged: callback,
        onChatErrorChanged: callback,
      }),
    () => ({
      messages: messagesStore.getMessages(activeChatId),
      status: messagesStore.getStatus(activeChatId) ?? 'ready',
      error: messagesStore.getError(activeChatId),
    }),
    () => ({
      messages: processedInitialMessages,
      status: 'ready' as const,
      error: undefined,
    }),
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
    async (chatRequest: Omit<ChatRequest, 'messages'> = {}) => {
      messagesStore.setStatus({ id: activeChatId, status: 'submitted' });
      messagesStore.setError({ id: activeChatId, error: undefined });

      const previousMessages = messagesStore.getMessages(activeChatId) ?? [];
      const chatMessages = fillMessageParts(previousMessages);

      const messageCount = chatMessages.length;
      const maxStep = extractMaxToolInvocationStep(
        chatMessages[chatMessages.length - 1]?.toolInvocations,
      );

      try {
        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        const throttledMutateStreamData = throttle(
          mutateStreamData,
          throttleWaitMs,
        );

        messagesStore.setMessages({ id: activeChatId, messages: chatMessages });

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

        await callChatApiV2({
          api,
          body: experimental_prepareRequestBody?.({
            id: activeChatId,
            messages: chatMessages,
            requestData: chatRequest.data,
            requestBody: chatRequest.body,
          }) ?? {
            id: activeChatId,
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
              messagesStore.setMessages({
                id: activeChatId,
                messages: previousMessages,
              });
            }
          },
          onResponse,
          onUpdate({ data }) {
            messagesStore.setStatus({ id: activeChatId, status: 'streaming' });
            if (data?.length) {
              const updatedData = [...(existingData ?? []), ...data];
              throttledMutateStreamData(updatedData, false);
            }
          },
          onToolCall,
          onFinish,
          generateId,
          fetch,
          store: messagesStore,
        });

        abortControllerRef.current = null;

        messagesStore.setStatus({ id: activeChatId, status: 'ready' });
      } catch (err) {
        // Ignore abort errors as they are expected.
        if ((err as any).name === 'AbortError') {
          abortControllerRef.current = null;
          messagesStore.setStatus({ id: activeChatId, status: 'ready' });
          return null;
        }

        if (onError && err instanceof Error) {
          onError(err);
        }

        messagesStore.setError({ id: activeChatId, error: err as Error });
        messagesStore.setStatus({ id: activeChatId, status: 'error' });
      }

      // Auto-submit when all tool calls in
      // the last assistant message have results
      // and assistant has not answered yet
      if (
        shouldResubmitMessages({
          originalMaxToolInvocationStep: maxStep,
          originalMessageCount: messageCount,
          maxSteps,
          messages: messagesStore.getMessages(activeChatId) ?? [],
        })
      ) {
        await triggerRequest();
      }
    },
    [
      messagesStore,
      activeChatId,
      maxSteps,
      mutateStreamData,
      throttleWaitMs,
      sendExtraMessageFields,
      api,
      experimental_prepareRequestBody,
      streamProtocol,
      onResponse,
      onToolCall,
      onFinish,
      generateId,
      fetch,
      keepLastMessageOnError,
      onError,
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

      const newMessage = {
        ...message,
        id: message.id ?? generateId(),
        createdAt: message.createdAt ?? new Date(),
        experimental_attachments:
          attachmentsForRequest.length > 0 ? attachmentsForRequest : undefined,
        parts: getMessageParts(message),
      };

      messagesStore.appendMessage({ id: activeChatId, message: newMessage });

      return triggerRequest({ headers, body, data });
    },
    [activeChatId, generateId, messagesStore, triggerRequest],
  );

  const reload = useCallback(
    async ({ data, headers, body }: ChatRequestOptions = {}) => {
      const current = messagesStore.getMessages(activeChatId) ?? [];
      if (current.length === 0) return null;

      messagesStore.removeAssistantResponse(activeChatId);

      return triggerRequest({
        headers,
        body,
        data,
      });
    },
    [activeChatId, messagesStore, triggerRequest],
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
        messages = messages(messagesStore.getMessages(activeChatId) ?? []);
      }
      const messagesWithParts = fillMessageParts(messages);
      messagesStore.setMessages({
        id: activeChatId,
        messages: messagesWithParts,
      });
    },
    [activeChatId, messagesStore],
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

      const userMessage: UIMessage = {
        id: generateId(),
        createdAt: new Date(),
        role: 'user',
        content: input,
        experimental_attachments:
          attachmentsForRequest.length > 0 ? attachmentsForRequest : undefined,
        parts: [{ type: 'text', text: input }],
      };

      messagesStore.appendMessage({
        id: activeChatId,
        message: userMessage,
      });

      triggerRequest({
        headers: options.headers,
        body: options.body,
        data: options.data,
      });

      setInput('');
    },
    [input, generateId, messagesStore, activeChatId, triggerRequest],
  );

  const handleInputChange = (e: any) => {
    setInput(e.target.value);
  };

  const addToolResult = useCallback(
    ({ toolCallId, result }: { toolCallId: string; result: unknown }) => {
      messagesStore.addOrUpdateAssistantMessageParts({
        chatId: activeChatId,
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

      // Auto-submit when all tool calls in the last assistant message have results:
      const currentMessages = messagesStore.getMessages(activeChatId) ?? [];
      const lastMessage = currentMessages[currentMessages.length - 1];
      if (
        lastMessage &&
        isAssistantMessageWithCompletedToolCalls(lastMessage)
      ) {
        triggerRequest();
      }
    },
    [activeChatId, messagesStore, status, triggerRequest],
  );

  return {
    messages: messages ?? [],
    id: activeChatId,
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
    status,
    addToolResult,
  };
}
