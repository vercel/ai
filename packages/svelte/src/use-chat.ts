import { FetchFunction } from '@ai-sdk/provider-utils';
import type {
  ChatRequest,
  ChatRequestOptions,
  CreateMessage,
  IdGenerator,
  JSONValue,
  Message,
  UseChatOptions as SharedUseChatOptions,
  UIMessage,
} from '@ai-sdk/ui-utils';
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
} from '@ai-sdk/ui-utils';
import { useSWR } from 'sswr';
import { Readable, Writable, derived, get, writable } from 'svelte/store';
export type { CreateMessage, Message };

export type UseChatOptions = SharedUseChatOptions & {
  /**
Maximum number of sequential LLM calls (steps), e.g. when you use tool calls. Must be at least 1.

A maximum number is required to prevent infinite loops in the case of misconfigured tools.

By default, it's set to 1, which means that only a single LLM call is made.
 */
  maxSteps?: number;
};

export type UseChatHelpers = {
  /** Current messages in the chat */
  messages: Readable<UIMessage[]>;
  /** The error object of the API request */
  error: Readable<undefined | Error>;
  /**
   * Append a user message to the chat list. This triggers the API call to fetch
   * the assistant's response.
   * @param message The message to append
   * @param chatRequestOptions Additional options to pass to the API call
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
  input: Writable<string>;
  /** Form submission handler to automatically reset input and append a user message  */
  handleSubmit: (
    event?: { preventDefault?: () => void },
    chatRequestOptions?: ChatRequestOptions,
  ) => void;
  metadata?: Object;

  /**
   * Whether the API request is in progress
   *
   * @deprecated use `status` instead
   */
  isLoading: Readable<boolean | undefined>;

  /**
   * Hook status:
   *
   * - `pending`: A message has been submitted, but the response stream has not started yet.
   * - `loading`: The response is actively streaming in, with data arriving incrementally.
   * - `ready`: The full response has been received and processed; a new user message can be submitted.
   * - `error`: An error occurred during the API request, preventing successful completion.
   */
  status: Readable<'pending' | 'loading' | 'ready' | 'error'>;

  /** Additional data added on the server via StreamData */
  data: Readable<JSONValue[] | undefined>;
  /** Set the data of the chat. You can use this to transform or clear the chat data. */
  setData: (
    data:
      | JSONValue[]
      | undefined
      | ((data: JSONValue[] | undefined) => JSONValue[] | undefined),
  ) => void;

  /** The id of the chat */
  id: string;
};

const store: Record<string, UIMessage[] | undefined> = {};

export function useChat({
  api = '/api/chat',
  id,
  initialMessages = [],
  initialInput = '',
  sendExtraMessageFields,
  streamProtocol = 'data',
  onResponse,
  onFinish,
  onError,
  onToolCall,
  credentials,
  headers,
  body,
  generateId = generateIdFunc,
  fetch,
  keepLastMessageOnError = true,
  maxSteps = 1,
}: UseChatOptions = {}): UseChatHelpers & {
  addToolResult: ({
    toolCallId,
    result,
  }: {
    toolCallId: string;
    result: any;
  }) => void;
} {
  // Generate a unique id for the chat if not provided.
  const chatId = id ?? generateId();

  const key = `${api}|${chatId}`;
  const { data, mutate: originalMutate } = useSWR<UIMessage[]>(key, {
    fetcher: () => store[key] ?? fillMessageParts(initialMessages),
    fallbackData: fillMessageParts(initialMessages),
  });

  const streamData = writable<JSONValue[] | undefined>(undefined);

  const status = writable<'pending' | 'loading' | 'ready' | 'error'>('ready');

  // Force the `data` to be `initialMessages` if it's `undefined`.
  data.set(fillMessageParts(initialMessages));

  const mutate = (data: UIMessage[]) => {
    store[key] = data;
    return originalMutate(data);
  };

  // Because of the `fallbackData` option, the `data` will never be `undefined`.
  const messages = data as Writable<UIMessage[]>;

  // Abort controller to cancel the current API call.
  let abortController: AbortController | null = null;

  const extraMetadata = {
    credentials,
    headers,
    body,
  };

  const error = writable<undefined | Error>(undefined);

  // Actual mutation hook to send messages to the API endpoint and update the
  // chat state.
  async function triggerRequest(chatRequest: ChatRequest) {
    status.set('pending');
    error.set(undefined);

    const messagesSnapshot = get(messages);
    const messageCount = messagesSnapshot.length;
    const maxStep = extractMaxToolInvocationStep(
      chatRequest.messages[chatRequest.messages.length - 1]?.toolInvocations,
    );

    try {
      abortController = new AbortController();

      // Do an optimistic update to the chat state to show the updated messages
      // immediately.
      const chatMessages = fillMessageParts(chatRequest.messages);

      mutate(chatMessages);

      const existingData = get(streamData);
      const previousMessages = get(messages);

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

      await callChatApi({
        api,
        body: {
          id: chatId,
          messages: constructedMessagesPayload,
          data: chatRequest.data,
          ...extraMetadata.body,
          ...chatRequest.body,
        },
        streamProtocol,
        credentials: extraMetadata.credentials,
        headers: {
          ...extraMetadata.headers,
          ...chatRequest.headers,
        },
        abortController: () => abortController,
        restoreMessagesOnFailure() {
          if (!keepLastMessageOnError) {
            mutate(previousMessages);
          }
        },
        onResponse,
        onUpdate({ message, data, replaceLastMessage }) {
          status.set('loading');

          mutate([
            ...(replaceLastMessage
              ? chatMessages.slice(0, chatMessages.length - 1)
              : chatMessages),
            message,
          ]);
          if (data?.length) {
            streamData.set([...(existingData ?? []), ...data]);
          }
        },
        onFinish,
        generateId,
        onToolCall,
        fetch,
        lastMessage: chatMessages[chatMessages.length - 1],
      });

      status.set('ready');
    } catch (err) {
      // Ignore abort errors as they are expected.
      if ((err as any).name === 'AbortError') {
        abortController = null;
        return null;
      }

      if (onError && err instanceof Error) {
        onError(err);
      }

      error.set(err as Error);
      status.set('error');
    } finally {
      abortController = null;
    }

    // auto-submit when all tool calls in the last assistant message have results:
    const newMessagesSnapshot = get(messages);
    if (
      shouldResubmitMessages({
        originalMaxToolInvocationStep: maxStep,
        originalMessageCount: messageCount,
        maxSteps,
        messages: newMessagesSnapshot,
      })
    ) {
      await triggerRequest({ messages: newMessagesSnapshot });
    }
  }

  const append: UseChatHelpers['append'] = async (
    message: Message | CreateMessage,
    { data, headers, body, experimental_attachments }: ChatRequestOptions = {},
  ) => {
    const attachmentsForRequest = await prepareAttachmentsForRequest(
      experimental_attachments,
    );

    return triggerRequest({
      messages: get(messages).concat({
        ...message,
        id: message.id ?? generateId(),
        createdAt: message.createdAt ?? new Date(),
        experimental_attachments:
          attachmentsForRequest.length > 0 ? attachmentsForRequest : undefined,
        parts: getMessageParts(message),
      } as UIMessage),
      headers,
      body,
      data,
    });
  };

  const reload: UseChatHelpers['reload'] = async ({
    data,
    headers,
    body,
  }: ChatRequestOptions = {}) => {
    const messagesSnapshot = get(messages);
    if (messagesSnapshot.length === 0) {
      return null;
    }

    // Remove last assistant message and retry last user message.
    const lastMessage = messagesSnapshot.at(-1);
    return triggerRequest({
      messages:
        lastMessage?.role === 'assistant'
          ? messagesSnapshot.slice(0, -1)
          : messagesSnapshot,
      headers,
      body,
      data,
    });
  };

  const stop = () => {
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
  };

  const setMessages = (
    messagesArg: Message[] | ((messages: Message[]) => Message[]),
  ) => {
    if (typeof messagesArg === 'function') {
      messagesArg = messagesArg(get(messages));
    }

    mutate(fillMessageParts(messagesArg));
  };

  const setData = (
    dataArg:
      | JSONValue[]
      | undefined
      | ((data: JSONValue[] | undefined) => JSONValue[] | undefined),
  ) => {
    if (typeof dataArg === 'function') {
      dataArg = dataArg(get(streamData));
    }

    streamData.set(dataArg);
  };

  const input = writable(initialInput);

  const handleSubmit = async (
    event?: { preventDefault?: () => void },
    options: ChatRequestOptions = {},
  ) => {
    event?.preventDefault?.();
    const inputValue = get(input);

    if (!inputValue && !options.allowEmptySubmit) return;

    const attachmentsForRequest = await prepareAttachmentsForRequest(
      options.experimental_attachments,
    );

    triggerRequest({
      messages: get(messages).concat({
        id: generateId(),
        content: inputValue,
        role: 'user',
        createdAt: new Date(),
        experimental_attachments:
          attachmentsForRequest.length > 0 ? attachmentsForRequest : undefined,
        parts: [{ type: 'text', text: inputValue }],
      }),
      body: options.body,
      headers: options.headers,
      data: options.data,
    });

    input.set('');
  };

  const addToolResult = ({
    toolCallId,
    result,
  }: {
    toolCallId: string;
    result: any;
  }) => {
    const messagesSnapshot = get(messages) ?? [];

    updateToolCallResult({
      messages: messagesSnapshot,
      toolCallId,
      toolResult: result,
    });

    messages.set(messagesSnapshot);

    // auto-submit when all tool calls in the last assistant message have results:
    const lastMessage = messagesSnapshot[messagesSnapshot.length - 1];

    if (isAssistantMessageWithCompletedToolCalls(lastMessage)) {
      triggerRequest({ messages: messagesSnapshot });
    }
  };

  return {
    id: chatId,
    messages,
    error,
    append,
    reload,
    stop,
    setMessages,
    input,
    handleSubmit,
    isLoading: derived(
      status,
      $status => $status === 'pending' || $status === 'loading',
    ),
    status,
    data: streamData,
    setData,
    addToolResult,
  };
}
