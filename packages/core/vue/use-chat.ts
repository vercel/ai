import swrv from 'swrv';
import type { Ref } from 'vue';
import { ref, unref } from 'vue';
import { callApi } from '../shared/call-api';
import { processChatStream } from '../shared/process-chat-stream';
import type {
  ChatRequest,
  CreateMessage,
  JSONValue,
  Message,
  RequestOptions,
  UseChatOptions,
} from '../shared/types';
import { nanoid } from '../shared/utils';

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
    options?: RequestOptions,
  ) => Promise<string | null | undefined>;
  /**
   * Reload the last AI chat response for the given chat history. If the last
   * message isn't from the assistant, it will request the API to generate a
   * new response.
   */
  reload: (options?: RequestOptions) => Promise<string | null | undefined>;
  /**
   * Abort the current request immediately, keep the generated tokens if any.
   */
  stop: () => void;
  /**
   * Update the `messages` state locally. This is useful when you want to
   * edit the messages on the client, and then trigger the `reload` method
   * manually to regenerate the AI response.
   */
  setMessages: (messages: Message[]) => void;
  /** The current value of the input */
  input: Ref<string>;
  /** Form submission handler to automatically reset input and append a user message  */
  handleSubmit: (e: any) => void;
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
  onResponse,
  onFinish,
  onError,
  credentials,
  headers,
  body,
}: UseChatOptions = {}): UseChatHelpers {
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
    options?: RequestOptions,
  ) {
    try {
      error.value = undefined;
      mutateLoading(() => true);

      abortController = new AbortController();

      // Do an optimistic update to the chat state to show the updated messages
      // immediately.
      const previousMessages = messagesData.value;
      mutate(messagesSnapshot);

      let chatRequest: ChatRequest = {
        messages: messagesSnapshot,
        options,
      };

      await processChatStream({
        getStreamedResponse: async () => {
          const existingData = (streamData.value ?? []) as JSONValue[];

          return await callApi({
            api,
            messages: sendExtraMessageFields
              ? chatRequest.messages
              : chatRequest.messages.map(
                  ({ role, content, name, function_call }) => ({
                    role,
                    content,
                    ...(name !== undefined && { name }),
                    ...(function_call !== undefined && {
                      function_call: function_call,
                    }),
                  }),
                ),
            body: {
              ...unref(body), // Use unref to unwrap the ref value
              ...options?.body,
            },
            headers: {
              ...headers,
              ...options?.headers,
            },
            abortController: () => abortController,
            credentials,
            onResponse,
            onUpdate(merged, data) {
              mutate([...chatRequest.messages, ...merged]);
              streamData.value = [...existingData, ...(data ?? [])];
            },
            onFinish(message) {
              // workaround: sometimes the last chunk is not shown in the UI.
              // push it twice to make sure it's displayed.
              mutate([...chatRequest.messages, message]);
              onFinish?.(message);
            },
            appendMessage(message) {
              mutate([...chatRequest.messages, message]);
            },
            restoreMessagesOnFailure() {
              // Restore the previous messages if the request fails.
              mutate(previousMessages);
            },
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
      message.id = nanoid();
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

  const setMessages = (messages: Message[]) => {
    mutate(messages);
  };

  const input = ref(initialInput);

  const handleSubmit = (e: any) => {
    e.preventDefault();
    const inputValue = input.value;
    if (!inputValue) return;
    append({
      content: inputValue,
      role: 'user',
    });
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
