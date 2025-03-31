import { FetchFunction } from '@ai-sdk/provider-utils';
import type {
  ChatRequest,
  ChatRequestOptions,
  CreateMessage,
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
import {
  Accessor,
  createEffect,
  createMemo,
  createSignal,
  JSX,
  Setter,
} from 'solid-js';
import { createStore, reconcile, Store } from 'solid-js/store';
import { convertToAccessorOptions } from './utils/convert-to-accessor-options';
import { ReactiveLRU } from './utils/reactive-lru';

export type { CreateMessage, Message };

export type UseChatHelpers = {
  /**
   * Current messages in the chat as a SolidJS store.
   */
  messages: () => Store<UIMessage[]>;

  /** The error object of the API request */
  error: Accessor<undefined | Error>;
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
  input: Accessor<string>;
  /** Signal setter to update the input value */
  setInput: Setter<string>;
  /** An input/textarea-ready onChange handler to control the value of the input */
  handleInputChange: JSX.ChangeEventHandlerUnion<
    HTMLInputElement | HTMLTextAreaElement,
    Event
  >;
  /** Form submission handler to automatically reset input and append a user message */
  handleSubmit: (
    event?: { preventDefault?: () => void },
    chatRequestOptions?: ChatRequestOptions,
  ) => void;

  /**
   * Whether the API request is in progress
   *
   * @deprecated use `status` instead
   */
  isLoading: Accessor<boolean>;

  /**
   * Hook status:
   *
   * - `submitted`: The message has been sent to the API and we're awaiting the start of the response stream.
   * - `streaming`: The response is actively streaming in from the API, receiving chunks of data.
   * - `ready`: The full response has been received and processed; a new user message can be submitted.
   * - `error`: An error occurred during the API request, preventing successful completion.
   */
  status: Accessor<'submitted' | 'streaming' | 'ready' | 'error'>;

  /** Additional data added on the server via StreamData */
  data: Accessor<JSONValue[] | undefined>;
  /** Set the data of the chat. You can use this to transform or clear the chat data. */
  setData: (
    data:
      | JSONValue[]
      | undefined
      | ((data: JSONValue[] | undefined) => JSONValue[] | undefined),
  ) => void;

  /**
Custom fetch implementation. You can use it as a middleware to intercept requests,
or to provide a custom fetch implementation for e.g. testing.
    */
  fetch?: FetchFunction;

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

const chatCache = new ReactiveLRU<string, Message[]>();

export type UseChatOptions = SharedUseChatOptions & {
  /**
Maximum number of sequential LLM calls (steps), e.g. when you use tool calls. Must be at least 1.

A maximum number is required to prevent infinite loops in the case of misconfigured tools.

By default, it's set to 1, which means that only a single LLM call is made.
*/
  maxSteps?: number;

  /**
   * Experimental (SolidJS only). When a function is provided, it will be used
   * to prepare the request body for the chat API. This can be useful for
   * customizing the request body based on the messages and data in the chat.
   *
   * @param id The chat ID
   * @param messages The current messages in the chat
   * @param requestData The data object passed in the chat request
   * @param requestBody The request body object passed in the chat request
   */
  experimental_prepareRequestBody?: (options: {
    id: string;
    messages: UIMessage[];
    requestData?: JSONValue;
    requestBody?: object;
  }) => unknown;
};

/**
 * @deprecated `@ai-sdk/solid` has been deprecated and will be removed in AI SDK 5.
 */
export function useChat(
  rawUseChatOptions: UseChatOptions | Accessor<UseChatOptions> = {},
): UseChatHelpers {
  const resolvedOptions = createMemo(() =>
    convertToAccessorOptions(rawUseChatOptions),
  );
  const prepareFn = createMemo(() => {
    const opts = resolvedOptions();
    return opts.experimental_prepareRequestBody?.();
  });
  const useChatOptions = createMemo(() => ({
    ...resolvedOptions(),
    experimental_prepareRequestBody: prepareFn,
  }));

  const api = createMemo(() => useChatOptions().api?.() ?? '/api/chat');
  const generateId = createMemo(
    () => useChatOptions().generateId?.() ?? generateIdFunc,
  );
  const chatId = createMemo(() => useChatOptions().id?.() ?? generateId()());
  const chatKey = createMemo(() => `${api()}|${chatId()}|messages`);

  const _messages = createMemo(
    () =>
      chatCache.get(chatKey()) ?? useChatOptions().initialMessages?.() ?? [],
  );

  const [messagesStore, setMessagesStore] = createStore<UIMessage[]>(
    fillMessageParts(_messages()),
  );
  createEffect(() => {
    setMessagesStore(reconcile(fillMessageParts(_messages()), { merge: true }));
  });

  const mutate = (messages: UIMessage[]) => {
    chatCache.set(chatKey(), messages);
  };

  const [error, setError] = createSignal<undefined | Error>(undefined);
  const [streamData, setStreamData] = createSignal<JSONValue[] | undefined>(
    undefined,
  );
  const [status, setStatus] = createSignal<
    'submitted' | 'streaming' | 'ready' | 'error'
  >('ready');

  let messagesRef: UIMessage[] = fillMessageParts(_messages()) || [];
  createEffect(() => {
    messagesRef = fillMessageParts(_messages()) || [];
  });

  let abortController: AbortController | null = null;

  let extraMetadata = {
    credentials: useChatOptions().credentials?.(),
    headers: useChatOptions().headers?.(),
    body: useChatOptions().body?.(),
  };
  createEffect(() => {
    extraMetadata = {
      credentials: useChatOptions().credentials?.(),
      headers: useChatOptions().headers?.(),
      body: useChatOptions().body?.(),
    };
  });

  const triggerRequest = async (chatRequest: ChatRequest) => {
    setError(undefined);
    setStatus('submitted');

    const messageCount = messagesRef.length;
    const maxStep = extractMaxToolInvocationStep(
      chatRequest.messages[chatRequest.messages.length - 1]?.toolInvocations,
    );

    try {
      abortController = new AbortController();

      const streamProtocol = useChatOptions().streamProtocol?.() ?? 'data';

      const onFinish = useChatOptions().onFinish?.();
      const onResponse = useChatOptions().onResponse?.();
      const onToolCall = useChatOptions().onToolCall?.();

      const sendExtraMessageFields =
        useChatOptions().sendExtraMessageFields?.();

      const keepLastMessageOnError =
        useChatOptions().keepLastMessageOnError?.() ?? true;

      const experimental_prepareRequestBody =
        useChatOptions().experimental_prepareRequestBody?.();

      // Do an optimistic update to the chat state to show the updated messages
      // immediately.
      const previousMessages = messagesRef;
      const chatMessages = fillMessageParts(chatRequest.messages);

      mutate(chatMessages);

      const existingStreamData = streamData() ?? [];

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
        api: api(),
        body: experimental_prepareRequestBody?.({
          id: chatId(),
          messages: chatMessages,
          requestData: chatRequest.data,
          requestBody: chatRequest.body,
        }) ?? {
          id: chatId(),
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
          setStatus('streaming');

          mutate([
            ...(replaceLastMessage
              ? chatMessages.slice(0, chatMessages.length - 1)
              : chatMessages),
            message,
          ]);

          if (data?.length) {
            setStreamData([...existingStreamData, ...data]);
          }
        },
        onToolCall,
        onFinish,
        generateId: generateId(),
        fetch: useChatOptions().fetch?.(),
        lastMessage: chatMessages[chatMessages.length - 1],
      });

      abortController = null;
      setStatus('ready');
    } catch (err) {
      // Ignore abort errors as they are expected.
      if ((err as any).name === 'AbortError') {
        abortController = null;
        setStatus('ready');
        return null;
      }

      const onError = useChatOptions().onError?.();
      if (onError && err instanceof Error) {
        onError(err);
      }

      setError(err as Error);
      setStatus('error');
    }

    const maxSteps = useChatOptions().maxSteps?.() ?? 1;

    // auto-submit when all tool calls in the last assistant message have results:
    const messages = messagesRef;
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
  };

  const append: UseChatHelpers['append'] = async (
    message,
    { data, headers, body, experimental_attachments } = {},
  ) => {
    const attachmentsForRequest = await prepareAttachmentsForRequest(
      experimental_attachments,
    );

    const messages = messagesRef.concat({
      ...message,
      id: message.id ?? generateId()(),
      createdAt: message.createdAt ?? new Date(),
      experimental_attachments:
        attachmentsForRequest.length > 0 ? attachmentsForRequest : undefined,
      parts: getMessageParts(message),
    });

    return triggerRequest({
      messages,
      headers,
      body,
      data,
    });
  };

  const reload: UseChatHelpers['reload'] = async ({
    data,
    headers,
    body,
  } = {}) => {
    if (messagesRef.length === 0) {
      return null;
    }

    // Remove last assistant message and retry last user message.
    const lastMessage = messagesRef[messagesRef.length - 1];
    return triggerRequest({
      messages:
        lastMessage.role === 'assistant'
          ? messagesRef.slice(0, -1)
          : messagesRef,
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
      messagesArg = messagesArg(messagesRef);
    }

    const messagesWithParts = fillMessageParts(messagesArg);
    mutate(messagesWithParts);
    messagesRef = messagesWithParts;
  };

  const setData = (
    dataArg:
      | JSONValue[]
      | undefined
      | ((data: JSONValue[] | undefined) => JSONValue[] | undefined),
  ) => {
    if (typeof dataArg === 'function') {
      dataArg = dataArg(streamData());
    }

    setStreamData(dataArg);
  };

  const [input, setInput] = createSignal(
    useChatOptions().initialInput?.() || '',
  );

  const handleSubmit: UseChatHelpers['handleSubmit'] = async (
    event,
    options = {},
    metadata?: Object,
  ) => {
    event?.preventDefault?.();
    const inputValue = input();

    if (!inputValue && !options.allowEmptySubmit) return;

    const attachmentsForRequest = await prepareAttachmentsForRequest(
      options.experimental_attachments,
    );

    if (metadata) {
      extraMetadata = {
        ...extraMetadata,
        ...metadata,
      };
    }

    triggerRequest({
      messages: messagesRef.concat({
        id: generateId()(),
        role: 'user',
        content: inputValue,
        createdAt: new Date(),
        experimental_attachments:
          attachmentsForRequest.length > 0 ? attachmentsForRequest : undefined,
        parts: [{ type: 'text', text: inputValue }],
      }),
      headers: options.headers,
      body: options.body,
      data: options.data,
    });

    setInput('');
  };

  const handleInputChange: UseChatHelpers['handleInputChange'] = e => {
    setInput(e.target.value);
  };

  const addToolResult = ({
    toolCallId,
    result,
  }: {
    toolCallId: string;
    result: any;
  }) => {
    const currentMessages = messagesRef ?? [];

    updateToolCallResult({
      messages: currentMessages,
      toolCallId,
      toolResult: result,
    });

    mutate(currentMessages);

    // when the request is ongoing, the auto-submit will be triggered after the request is finished
    if (status() === 'submitted' || status() === 'streaming') {
      return;
    }

    // auto-submit when all tool calls in the last assistant message have results:
    const lastMessage = currentMessages[currentMessages.length - 1];
    if (isAssistantMessageWithCompletedToolCalls(lastMessage)) {
      triggerRequest({ messages: currentMessages });
    }
  };

  const isLoading = createMemo(
    () => status() === 'submitted' || status() === 'streaming',
  );

  return {
    // TODO next major release: replace with direct message store access (breaking change)
    messages: () => messagesStore,
    id: chatId(),
    append,
    error,
    reload,
    stop,
    setMessages,
    input,
    setInput,
    handleInputChange,
    handleSubmit,
    isLoading,
    status,
    data: streamData,
    setData,
    addToolResult,
  };
}
