import type {
  ChatRequest,
  ChatRequestOptions,
  CreateMessage,
  JSONValue,
  Message,
  UseChatOptions,
} from '@ai-sdk/ui-utils';
import {
  callChatApi,
  generateId as generateIdFunc,
  processChatStream,
} from '@ai-sdk/ui-utils';
import swrv from 'swrv';
import type { Ref } from 'vue';
import { ref, unref } from 'vue';

export type { CreateMessage, Message, UseChatOptions };

export type UseChatHelpers = {
  /** Current messages in the chat */
  messages: Ref<Message[]>;
  /** The error object of the API request */
  error: Ref<undefined | Error>;
  /**
   * Append a user message to the chat list. This triggers the API call to fetch
   * the assistant's response.
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
  input: Ref<string>;
  /** Form submission handler to automatically reset input and append a user message  */
  handleSubmit: (
    event?: { preventDefault?: () => void },
    chatRequestOptions?: ChatRequestOptions,
  ) => void;
  /** Whether the API request is in progress */
  isLoading: Ref<boolean | undefined>;

  /** Additional data added on the server via StreamData */
  data: Ref<JSONValue[] | undefined>;
};

let uniqueId = 0;

// @ts-expect-error - some issues with the default export of useSWRV
const useSWRV = (swrv.default as typeof import('swrv')['default']) || swrv;
const store: Record<string, Message[] | undefined> = {};

export function useChat({
  api = '/api/chat',
  id,
  initialMessages = [],
  initialInput = '',
  sendExtraMessageFields,
  experimental_onFunctionCall,
  streamMode,
  streamProtocol,
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
  // streamMode is deprecated, use streamProtocol instead.
  if (streamMode) {
    streamProtocol ??= streamMode === 'text' ? 'text' : undefined;
  }

  // Generate a unique ID for the chat if not provided.
  const chatId = id || `chat-${uniqueId++}`;

  const key = `${api}|${chatId}`;
  const { data: messagesData, mutate: originalMutate } = useSWRV<Message[]>(
    key,
    () => store[key] || initialMessages,
  );

  const { data: isLoading, mutate: mutateLoading } = useSWRV<boolean>(
    `${chatId}-loading`,
    null,
  );

  isLoading.value ??= false;

  // Force the `data` to be `initialMessages` if it's `undefined`.
  messagesData.value ??= initialMessages;

  const mutate = (data?: Message[]) => {
    store[key] = data;
    return originalMutate();
  };

  // Because of the `initialData` option, the `data` will never be `undefined`.
  const messages = messagesData as Ref<Message[]>;

  const error = ref<undefined | Error>(undefined);
  // cannot use JSONValue[] in ref because of infinite Typescript recursion:
  const streamData = ref<undefined | unknown[]>(undefined);

  let abortController: AbortController | null = null;
  async function triggerRequest(
    messagesSnapshot: Message[],
    { options, data, headers, body }: ChatRequestOptions = {},
  ) {
    try {
      error.value = undefined;
      mutateLoading(() => true);

      abortController = new AbortController();

      // Do an optimistic update to the chat state to show the updated messages
      // immediately.
      const previousMessages = messagesSnapshot;
      mutate(messagesSnapshot);

      const requestOptions = {
        headers: headers ?? options?.headers,
        body: body ?? options?.body,
      };

      let chatRequest: ChatRequest = {
        messages: messagesSnapshot,
        options: requestOptions,
        body: requestOptions.body,
        headers: requestOptions.headers,
        data,
      };

      await processChatStream({
        getStreamedResponse: async () => {
          const existingData = (streamData.value ?? []) as JSONValue[];

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
                }) => ({
                  role,
                  content,
                  ...(name !== undefined && { name }),
                  ...(data !== undefined && { data }),
                  ...(annotations !== undefined && { annotations }),
                  // outdated function/tool call handling (TODO deprecate):
                  ...(function_call !== undefined && { function_call }),
                }),
              );

          return await callChatApi({
            api,
            body: {
              messages: constructedMessagesPayload,
              data: chatRequest.data,
              ...unref(body), // Use unref to unwrap the ref value
              ...requestOptions.body,
            },
            streamProtocol,
            headers: {
              ...headers,
              ...requestOptions.headers,
            },
            abortController: () => abortController,
            credentials,
            onResponse,
            onUpdate(merged, data) {
              mutate([...chatRequest.messages, ...merged]);
              streamData.value = [...existingData, ...(data ?? [])];
            },
            onFinish(message, options) {
              // workaround: sometimes the last chunk is not shown in the UI.
              // push it twice to make sure it's displayed.
              mutate([...chatRequest.messages, message]);
              onFinish?.(message, options);
            },
            restoreMessagesOnFailure() {
              // Restore the previous messages if the request fails.
              if (!keepLastMessageOnError) {
                mutate(previousMessages);
              }
            },
            generateId,
            onToolCall: undefined, // not implemented yet
            fetch,
          });
        },
        experimental_onFunctionCall,
        updateChatRequest(newChatRequest) {
          chatRequest = newChatRequest;
        },
        getCurrentMessages: () => messages.value,
      });

      abortController = null;
    } catch (err) {
      // Ignore abort errors as they are expected.
      if ((err as any).name === 'AbortError') {
        abortController = null;
        return null;
      }

      if (onError && err instanceof Error) {
        onError(err);
      }

      error.value = err as Error;
    } finally {
      mutateLoading(() => false);
    }
  }

  const append: UseChatHelpers['append'] = async (message, options) => {
    if (!message.id) {
      message.id = generateId();
    }

    return triggerRequest(messages.value.concat(message as Message), options);
  };

  const reload: UseChatHelpers['reload'] = async options => {
    const messagesSnapshot = messages.value;
    if (messagesSnapshot.length === 0) return null;

    const lastMessage = messagesSnapshot[messagesSnapshot.length - 1];
    if (lastMessage.role === 'assistant') {
      return triggerRequest(messagesSnapshot.slice(0, -1), options);
    }

    return triggerRequest(messagesSnapshot, options);
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
      messagesArg = messagesArg(messages.value);
    }

    mutate(messagesArg);
  };

  const input = ref(initialInput);

  const handleSubmit = (
    event?: { preventDefault?: () => void },
    options: ChatRequestOptions = {},
  ) => {
    event?.preventDefault?.();

    const inputValue = input.value;

    if (!inputValue && !options.allowEmptySubmit) return;

    triggerRequest(
      !inputValue && options.allowEmptySubmit
        ? messages.value
        : messages.value.concat({
            id: generateId(),
            createdAt: new Date(),
            content: inputValue,
            role: 'user',
          }),
      options,
    );

    input.value = '';
  };

  return {
    messages,
    append,
    error,
    reload,
    stop,
    setMessages,
    input,
    handleSubmit,
    isLoading,
    data: streamData as Ref<undefined | JSONValue[]>,
  };
}
