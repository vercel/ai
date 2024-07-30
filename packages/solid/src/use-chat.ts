import type {
  ChatRequest,
  ChatRequestOptions,
  CreateMessage,
  FetchFunction,
  IdGenerator,
  JSONValue,
  Message,
  UseChatOptions as SharedUseChatOptions,
} from '@ai-sdk/ui-utils';
import {
  callChatApi,
  generateId as generateIdFunc,
  processChatStream,
} from '@ai-sdk/ui-utils';
import {
  Accessor,
  JSX,
  Setter,
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
} from 'solid-js';
import { createStore } from 'solid-js/store';

export type { CreateMessage, Message };

export type UseChatHelpers = {
  /** Current messages in the chat */
  messages: Accessor<Message[]>;
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
  /** Whether the API request is in progress */
  isLoading: Accessor<boolean>;
  /** Additional data added on the server via StreamData */
  data: Accessor<JSONValue[] | undefined>;

  /**
Custom fetch implementation. You can use it as a middleware to intercept requests,
or to provide a custom fetch implementation for e.g. testing.
    */
  fetch?: FetchFunction;
};

const getStreamedResponse = async (
  api: string,
  chatRequest: ChatRequest,
  mutate: (data: Message[]) => void,
  setStreamData: Setter<JSONValue[] | undefined>,
  streamData: Accessor<JSONValue[] | undefined>,
  extraMetadata: any,
  messagesRef: Message[],
  abortController: AbortController | null,
  generateId: IdGenerator,
  streamProtocol: UseChatOptions['streamProtocol'],
  onFinish: UseChatOptions['onFinish'],
  onResponse: UseChatOptions['onResponse'] | undefined,
  onToolCall: UseChatOptions['onToolCall'] | undefined,
  sendExtraMessageFields: boolean | undefined,
  fetch: FetchFunction | undefined,
  keepLastMessageOnError: boolean,
) => {
  // Do an optimistic update to the chat state to show the updated messages
  // immediately.
  const previousMessages = messagesRef;

  mutate(chatRequest.messages);

  const existingStreamData = streamData() ?? [];

  const constructedMessagesPayload = sendExtraMessageFields
    ? chatRequest.messages
    : chatRequest.messages.map(
        ({ role, content, name, data, annotations, toolInvocations }) => ({
          role,
          content,
          ...(name !== undefined && { name }),
          ...(data !== undefined && { data }),
          ...(annotations !== undefined && { annotations }),
          ...(toolInvocations !== undefined && { toolInvocations }),
        }),
      );

  return await callChatApi({
    api,
    body: {
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
    onUpdate(merged, data) {
      mutate([...chatRequest.messages, ...merged]);
      setStreamData([...existingStreamData, ...(data ?? [])]);
    },
    onToolCall,
    onFinish,
    generateId,
    fetch,
  });
};

// This store saves the messages for each chat ID
const [store, setStore] = createStore<Record<string, Message[]>>({});

export type UseChatOptions = SharedUseChatOptions & {
  /**
Maximal number of automatic roundtrips for tool calls.

An automatic tool call roundtrip is a call to the server with the
tool call results when all tool calls in the last assistant
message have results.

A maximum number is required to prevent infinite loops in the
case of misconfigured tools.

By default, it's set to 0, which will disable the feature.
 */
  maxToolRoundtrips?: number;
};

export function useChat(
  rawUseChatOptions: UseChatOptions | Accessor<UseChatOptions> = {},
): UseChatHelpers & {
  addToolResult: ({
    toolCallId,
    result,
  }: {
    toolCallId: string;
    result: any;
  }) => void;
} {
  const useChatOptions = createMemo(() =>
    convertToAccessorOptions(rawUseChatOptions),
  );

  const api = createMemo(() => useChatOptions().api?.() ?? '/api/chat');
  const generateId = createMemo(
    () => useChatOptions().generateId?.() ?? generateIdFunc,
  );

  const idKey = createMemo(
    () => useChatOptions().id?.() ?? `chat-${createUniqueId()}`,
  );
  const chatKey = createMemo(() => `${api()}|${idKey()}|messages`);

  const messages = createMemo(() => {
    return store[chatKey()] ?? useChatOptions().initialMessages?.() ?? [];
  });

  const mutate = (data: Message[]) => {
    setStore(chatKey(), data);
  };

  const [error, setError] = createSignal<undefined | Error>(undefined);
  const [streamData, setStreamData] = createSignal<JSONValue[] | undefined>(
    undefined,
  );
  const [isLoading, setIsLoading] = createSignal(false);

  let messagesRef: Message[] = messages() || [];
  createEffect(() => {
    messagesRef = messages() || [];
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
    const messageCount = messagesRef.length;

    try {
      setError(undefined);
      setIsLoading(true);

      abortController = new AbortController();

      await processChatStream({
        getStreamedResponse: () =>
          getStreamedResponse(
            api(),
            chatRequest,
            mutate,
            setStreamData,
            streamData,
            extraMetadata,
            messagesRef,
            abortController,
            generateId(),
            // streamMode is deprecated, use streamProtocol instead:
            useChatOptions().streamProtocol?.() ??
              useChatOptions().streamMode?.() === 'text'
              ? 'text'
              : undefined,
            useChatOptions().onFinish?.(),
            useChatOptions().onResponse?.(),
            useChatOptions().onToolCall?.(),
            useChatOptions().sendExtraMessageFields?.(),
            useChatOptions().fetch?.(),
            useChatOptions().keepLastMessageOnError?.() ?? false,
          ),
        experimental_onFunctionCall:
          useChatOptions().experimental_onFunctionCall?.(),
        updateChatRequest(newChatRequest) {
          chatRequest = newChatRequest;
        },
        getCurrentMessages: () => messagesRef,
      });

      abortController = null;
    } catch (err) {
      // Ignore abort errors as they are expected.
      if ((err as any).name === 'AbortError') {
        abortController = null;
        return null;
      }

      const onError = useChatOptions().onError?.();
      if (onError && err instanceof Error) {
        onError(err);
      }

      setError(err as Error);
    } finally {
      setIsLoading(false);
    }

    const maxToolRoundtrips = useChatOptions().maxToolRoundtrips?.() ?? 0;
    // auto-submit when all tool calls in the last assistant message have results:
    const messages = messagesRef;
    const lastMessage = messages[messages.length - 1];
    if (
      // ensure we actually have new messages (to prevent infinite loops in case of errors):
      messages.length > messageCount &&
      // ensure there is a last message:
      lastMessage != null &&
      // check if the feature is enabled:
      maxToolRoundtrips > 0 &&
      // check that roundtrip is possible:
      isAssistantMessageWithCompletedToolCalls(lastMessage) &&
      // limit the number of automatic roundtrips:
      countTrailingAssistantMessages(messages) <= maxToolRoundtrips
    ) {
      await triggerRequest({ messages });
    }
  };

  const append: UseChatHelpers['append'] = async (
    message,
    { options, data, headers, body } = {},
  ) => {
    if (!message.id) {
      message.id = generateId()();
    }

    const requestOptions = {
      headers: headers ?? options?.headers,
      body: body ?? options?.body,
    };

    const chatRequest: ChatRequest = {
      messages: messagesRef.concat(message as Message),
      options: requestOptions,
      headers: requestOptions.headers,
      body: requestOptions.body,
      data,
    };

    return triggerRequest(chatRequest);
  };

  const reload: UseChatHelpers['reload'] = async ({
    options,
    data,
    headers,
    body,
  } = {}) => {
    if (messagesRef.length === 0) return null;

    const requestOptions = {
      headers: headers ?? options?.headers,
      body: body ?? options?.body,
    };

    // Remove last assistant message and retry last user message.
    const lastMessage = messagesRef[messagesRef.length - 1];
    if (lastMessage.role === 'assistant') {
      const chatRequest: ChatRequest = {
        messages: messagesRef.slice(0, -1),
        options: requestOptions,
        headers: requestOptions.headers,
        body: requestOptions.body,
        data,
      };

      return triggerRequest(chatRequest);
    }

    const chatRequest: ChatRequest = {
      messages: messagesRef,
      options: requestOptions,
      headers: requestOptions.headers,
      body: requestOptions.body,
      data,
    };

    return triggerRequest(chatRequest);
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

    mutate(messagesArg);
    messagesRef = messagesArg;
  };

  const [input, setInput] = createSignal(
    useChatOptions().initialInput?.() || '',
  );

  const handleSubmit: UseChatHelpers['handleSubmit'] = (
    event,
    options = {},
    metadata?: Object,
  ) => {
    event?.preventDefault?.();
    const inputValue = input();

    if (!inputValue && !options.allowEmptySubmit) return;

    if (metadata) {
      extraMetadata = {
        ...extraMetadata,
        ...metadata,
      };
    }

    const requestOptions = {
      headers: options.headers ?? options.options?.headers,
      body: options.body ?? options.options?.body,
    };

    const chatRequest: ChatRequest = {
      messages:
        !inputValue && options.allowEmptySubmit
          ? messagesRef
          : messagesRef.concat({
              id: generateId()(),
              role: 'user',
              content: inputValue,
              createdAt: new Date(),
            }),
      options: requestOptions,
      body: requestOptions.body,
      headers: requestOptions.headers,
      data: options.data,
    };

    triggerRequest(chatRequest);

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
    const messagesSnapshot = messages() ?? [];

    const updatedMessages = messagesSnapshot.map((message, index, arr) =>
      // update the tool calls in the last assistant message:
      index === arr.length - 1 &&
      message.role === 'assistant' &&
      message.toolInvocations
        ? {
            ...message,
            toolInvocations: message.toolInvocations.map(toolInvocation =>
              toolInvocation.toolCallId === toolCallId
                ? { ...toolInvocation, result }
                : toolInvocation,
            ),
          }
        : message,
    );

    mutate(updatedMessages);

    // auto-submit when all tool calls in the last assistant message have results:
    const lastMessage = updatedMessages[updatedMessages.length - 1];
    if (isAssistantMessageWithCompletedToolCalls(lastMessage)) {
      triggerRequest({ messages: updatedMessages });
    }
  };

  return {
    messages,
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
    data: streamData,
    addToolResult,
  };
}

/**
Check if the message is an assistant message with completed tool calls.
The message must have at least one tool invocation and all tool invocations
must have a result.
 */
function isAssistantMessageWithCompletedToolCalls(message: Message) {
  return (
    message.role === 'assistant' &&
    message.toolInvocations &&
    message.toolInvocations.length > 0 &&
    message.toolInvocations.every(toolInvocation => 'result' in toolInvocation)
  );
}

/**
Returns the number of trailing assistant messages in the array.
 */
function countTrailingAssistantMessages(messages: Message[]) {
  let count = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      count++;
    } else {
      break;
    }
  }
  return count;
}

/**
 * Handle reactive and non-reactive useChatOptions
 */
function convertToAccessorOptions(
  options: UseChatOptions | Accessor<UseChatOptions>,
) {
  const resolvedOptions = typeof options === 'function' ? options() : options;

  return Object.entries(resolvedOptions).reduce(
    (reactiveOptions, [key, value]) => {
      reactiveOptions[key as keyof UseChatOptions] = createMemo(
        () => value,
      ) as any;
      return reactiveOptions;
    },
    {} as {
      [K in keyof UseChatOptions]: Accessor<UseChatOptions[K]>;
    },
  );
}
