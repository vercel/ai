import type {
  ChatRequest,
  ChatRequestOptions,
  CreateMessage,
  FetchFunction,
  IdGenerator,
  JSONValue,
  Message,
  UseChatOptions,
} from '@ai-sdk/ui-utils';
import {
  callChatApi,
  generateId as generateIdFunc,
  processChatStream,
} from '@ai-sdk/ui-utils';
import { useSWR } from 'sswr';
import { Readable, Writable, derived, get, writable } from 'svelte/store';
export type { CreateMessage, Message, UseChatOptions };

export type UseChatHelpers = {
  /** Current messages in the chat */
  messages: Readable<Message[]>;
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
  /** Whether the API request is in progress */
  isLoading: Readable<boolean | undefined>;

  /** Additional data added on the server via StreamData */
  data: Readable<JSONValue[] | undefined>;
};
const getStreamedResponse = async (
  api: string,
  chatRequest: ChatRequest,
  mutate: (messages: Message[]) => void,
  mutateStreamData: (data: JSONValue[] | undefined) => void,
  existingData: JSONValue[] | undefined,
  extraMetadata: {
    credentials?: RequestCredentials;
    headers?: Record<string, string> | Headers;
    body?: any;
  },
  previousMessages: Message[],
  abortControllerRef: AbortController | null,
  generateId: IdGenerator,
  streamMode: 'stream-data' | 'text' | undefined,
  onFinish: ((message: Message) => void) | undefined,
  onResponse: ((response: Response) => void | Promise<void>) | undefined,
  sendExtraMessageFields: boolean | undefined,
  fetch: FetchFunction | undefined,
  keepLastMessageOnError: boolean | undefined,
) => {
  // Do an optimistic update to the chat state to show the updated messages
  // immediately.
  mutate(chatRequest.messages);

  const constructedMessagesPayload = sendExtraMessageFields
    ? chatRequest.messages
    : chatRequest.messages.map(
        ({
          role,
          content,
          name,
          data,
          annotations,
          function_call,
          tool_calls,
          tool_call_id,
        }) => ({
          role,
          content,
          ...(name !== undefined && { name }),
          ...(data !== undefined && { data }),
          ...(annotations !== undefined && { annotations }),
          // outdated function/tool call handling (TODO deprecate):
          tool_call_id,
          ...(function_call !== undefined && { function_call }),
          ...(tool_calls !== undefined && { tool_calls }),
        }),
      );

  return await callChatApi({
    api,
    body: {
      messages: constructedMessagesPayload,
      data: chatRequest.data,
      ...extraMetadata.body,
      ...chatRequest.body,
      ...(chatRequest.functions !== undefined && {
        functions: chatRequest.functions,
      }),
      ...(chatRequest.function_call !== undefined && {
        function_call: chatRequest.function_call,
      }),
      ...(chatRequest.tools !== undefined && {
        tools: chatRequest.tools,
      }),
      ...(chatRequest.tool_choice !== undefined && {
        tool_choice: chatRequest.tool_choice,
      }),
    },
    streamMode,
    credentials: extraMetadata.credentials,
    headers: {
      ...extraMetadata.headers,
      ...chatRequest.headers,
    },
    abortController: () => abortControllerRef,
    restoreMessagesOnFailure() {
      if (!keepLastMessageOnError) {
        mutate(previousMessages);
      }
    },
    onResponse,
    onUpdate(merged, data) {
      mutate([...chatRequest.messages, ...merged]);
      mutateStreamData([...(existingData || []), ...(data || [])]);
    },
    onFinish,
    generateId,
    onToolCall: undefined, // not implemented yet
    fetch,
  });
};

let uniqueId = 0;

const store: Record<string, Message[] | undefined> = {};

export function useChat({
  api = '/api/chat',
  id,
  initialMessages = [],
  initialInput = '',
  sendExtraMessageFields,
  experimental_onFunctionCall,
  experimental_onToolCall,
  streamMode,
  onResponse,
  onFinish,
  onError,
  credentials,
  headers,
  body,
  generateId = generateIdFunc,
  fetch,
  keepLastMessageOnError = false,
}: UseChatOptions = {}): UseChatHelpers {
  // Generate a unique id for the chat if not provided.
  const chatId = id || `chat-${uniqueId++}`;

  const key = `${api}|${chatId}`;
  const {
    data,
    mutate: originalMutate,
    isLoading: isSWRLoading,
  } = useSWR<Message[]>(key, {
    fetcher: () => store[key] || initialMessages,
    fallbackData: initialMessages,
  });

  const streamData = writable<JSONValue[] | undefined>(undefined);

  const loading = writable<boolean>(false);

  // Force the `data` to be `initialMessages` if it's `undefined`.
  data.set(initialMessages);

  const mutate = (data: Message[]) => {
    store[key] = data;
    return originalMutate(data);
  };

  // Because of the `fallbackData` option, the `data` will never be `undefined`.
  const messages = data as Writable<Message[]>;

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
    try {
      error.set(undefined);
      loading.set(true);
      abortController = new AbortController();

      await processChatStream({
        getStreamedResponse: () =>
          getStreamedResponse(
            api,
            chatRequest,
            mutate,
            data => {
              streamData.set(data);
            },
            get(streamData),
            extraMetadata,
            get(messages),
            abortController,
            generateId,
            streamMode,
            onFinish,
            onResponse,
            sendExtraMessageFields,
            fetch,
            keepLastMessageOnError,
          ),
        experimental_onFunctionCall,
        experimental_onToolCall,
        updateChatRequest: chatRequestParam => {
          chatRequest = chatRequestParam;
        },
        getCurrentMessages: () => get(messages),
      });

      abortController = null;

      return null;
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
    } finally {
      loading.set(false);
    }
  }

  const append: UseChatHelpers['append'] = async (
    message: Message | CreateMessage,
    {
      options,
      functions,
      function_call,
      tools,
      tool_choice,
      data,
      headers,
      body,
    }: ChatRequestOptions = {},
  ) => {
    if (!message.id) {
      message.id = generateId();
    }

    const requestOptions = {
      headers: headers ?? options?.headers,
      body: body ?? options?.body,
    };

    const chatRequest: ChatRequest = {
      messages: get(messages).concat(message as Message),
      options: requestOptions,
      headers: requestOptions.headers,
      body: requestOptions.body,
      data,
      ...(functions !== undefined && { functions }),
      ...(function_call !== undefined && { function_call }),
      ...(tools !== undefined && { tools }),
      ...(tool_choice !== undefined && { tool_choice }),
    };
    return triggerRequest(chatRequest);
  };

  const reload: UseChatHelpers['reload'] = async ({
    options,
    functions,
    function_call,
    tools,
    tool_choice,
  }: ChatRequestOptions = {}) => {
    const messagesSnapshot = get(messages);
    if (messagesSnapshot.length === 0) return null;

    // Remove last assistant message and retry last user message.
    const lastMessage = messagesSnapshot.at(-1);
    if (lastMessage?.role === 'assistant') {
      const chatRequest: ChatRequest = {
        messages: messagesSnapshot.slice(0, -1),
        options,
        ...(functions !== undefined && { functions }),
        ...(function_call !== undefined && { function_call }),
        ...(tools !== undefined && { tools }),
        ...(tool_choice !== undefined && { tool_choice }),
      };

      return triggerRequest(chatRequest);
    }
    const chatRequest: ChatRequest = {
      messages: messagesSnapshot,
      options,
      ...(functions !== undefined && { functions }),
      ...(function_call !== undefined && { function_call }),
      ...(tools !== undefined && { tools }),
      ...(tool_choice !== undefined && { tool_choice }),
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
      messagesArg = messagesArg(get(messages));
    }

    mutate(messagesArg);
  };

  const input = writable(initialInput);

  const handleSubmit = (
    event?: { preventDefault?: () => void },
    options: ChatRequestOptions = {},
  ) => {
    event?.preventDefault?.();
    const inputValue = get(input);

    if (!inputValue && !options.allowEmptySubmit) return;

    const requestOptions = {
      headers: options.headers ?? options.options?.headers,
      body: options.body ?? options.options?.body,
    };

    const chatRequest: ChatRequest = {
      messages:
        !inputValue && options.allowEmptySubmit
          ? get(messages)
          : get(messages).concat({
              id: generateId(),
              content: inputValue,
              role: 'user',
              createdAt: new Date(),
            } as Message),
      options: requestOptions,
      body: requestOptions.body,
      headers: requestOptions.headers,
      data: options.data,
    };

    triggerRequest(chatRequest);

    input.set('');
  };

  const isLoading = derived(
    [isSWRLoading, loading],
    ([$isSWRLoading, $loading]) => {
      return $isSWRLoading || $loading;
    },
  );

  return {
    messages,
    error,
    append,
    reload,
    stop,
    setMessages,
    input,
    handleSubmit,
    isLoading,
    data: streamData,
  };
}
