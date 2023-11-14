import { Accessor, Resource, Setter, createSignal } from 'solid-js';
import { useSWRStore } from 'solid-swr-store';
import { createSWRStore } from 'swr-store';

import type {
  ChatRequest,
  CreateMessage,
  FunctionCall,
  Message,
  RequestOptions,
  UseChatOptions,
} from '../shared/types';
import { COMPLEX_HEADER, createChunkDecoder, nanoid } from '../shared/utils';
import { parseComplexResponse } from '../react/parse-complex-response';
import { callApi } from '../shared/call-api';

export type { CreateMessage, Message, UseChatOptions };

export type UseChatHelpers = {
  /** Current messages in the chat */
  messages: Resource<Message[]>;
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
  input: Accessor<string>;
  /** Signal setter to update the input value */
  setInput: Setter<string>;
  /** Form submission handler to automatically reset input and append a user message  */
  handleSubmit: (e: any) => void;
  /** Whether the API request is in progress */
  isLoading: Accessor<boolean>;
  /** Additional data added on the server via StreamData */
  data?: any;
};

let uniqueId = 0;

const store: Record<string, Message[] | undefined> = {};
const chatApiStore = createSWRStore<Message[], string[]>({
  get: async (key: string) => {
    return store[key] ?? [];
  },
});

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

  // Because of the `initialData` option, the `data` will never be `undefined`:
  const messages = useSWRStore(chatApiStore, () => [key], {
    initialData: initialMessages,
  }) as Resource<Message[]>;

  const mutate = (data: Message[]) => {
    store[key] = data;
    return chatApiStore.mutate([key], {
      status: 'success',
      data,
    });
  };

  const [error, setError] = createSignal<undefined | Error>(undefined);
  const [streamData, setStreamData] = createSignal<undefined | any[]>(
    undefined,
  );
  const [isLoading, setIsLoading] = createSignal(false);

  let abortController: AbortController | null = null;
  async function triggerRequest(
    messagesSnapshot: Message[],
    options?: RequestOptions,
  ) {
    try {
      setError(undefined);
      setIsLoading(true);

      abortController = new AbortController();

      const getCurrentMessages = () =>
        chatApiStore.get([key], {
          shouldRevalidate: false,
        });

      // Do an optimistic update to the chat state to show the updated messages
      // immediately.
      const previousMessages = getCurrentMessages();
      mutate(messagesSnapshot);

      let chatRequest: ChatRequest = {
        messages: messagesSnapshot,
        options,
      };

      const getStreamedResponse = async () => {
        const existingData = streamData() ?? [];

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
                    function_call,
                  }),
                }),
              ),
          body: {
            ...body,
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
            setStreamData([...existingData, ...(data ?? [])]);
          },
          onFinish,
          appendMessage(message) {
            mutate([...chatRequest.messages, message]);
          },
          restoreMessagesOnFailure() {
            // Restore the previous messages if the request fails.
            if (previousMessages.status === 'success') {
              mutate(previousMessages.data);
            }
          },
        });
      };

      while (true) {
        // TODO-STREAMDATA: This should be {  const { messages: streamedResponseMessages, data } =
        // await getStreamedResponse(} once Stream Data is not experimental
        const messagesAndDataOrJustMessage = await getStreamedResponse();

        // Using experimental stream data
        if ('messages' in messagesAndDataOrJustMessage) {
          let hasFollowingResponse = false;
          for (const message of messagesAndDataOrJustMessage.messages) {
            if (
              message.function_call === undefined ||
              typeof message.function_call === 'string'
            ) {
              continue;
            }
            hasFollowingResponse = true;
            // Streamed response is a function call, invoke the function call handler if it exists.
            if (experimental_onFunctionCall) {
              const functionCall = message.function_call;

              const currentMessages = getCurrentMessages();

              if (currentMessages.status !== 'success') {
                throw new Error(
                  'The current messages state is not ready yet. Please try again.',
                );
              }

              // User handles the function call in their own functionCallHandler.
              // The "arguments" key of the function call object will still be a string which will have to be parsed in the function handler.
              // If the "arguments" JSON is malformed due to model error the user will have to handle that themselves.

              const functionCallResponse: ChatRequest | void =
                await experimental_onFunctionCall(
                  currentMessages.data,
                  functionCall,
                );

              // If the user does not return anything as a result of the function call, the loop will break.
              if (functionCallResponse === undefined) {
                hasFollowingResponse = false;
                break;
              }

              // A function call response was returned.
              // The updated chat with function call response will be sent to the API in the next iteration of the loop.
              chatRequest = functionCallResponse;
            }
          }
          if (!hasFollowingResponse) {
            break;
          }
        } else {
          const streamedResponseMessage = messagesAndDataOrJustMessage;
          // TODO-STREAMDATA: Remove this once Stream Data is not experimental
          if (
            streamedResponseMessage.function_call === undefined ||
            typeof streamedResponseMessage.function_call === 'string'
          ) {
            break;
          }

          // Streamed response is a function call, invoke the function call handler if it exists.
          if (experimental_onFunctionCall) {
            const currentMessages = getCurrentMessages();

            if (currentMessages.status !== 'success') {
              throw new Error(
                'The current messages state is not ready yet. Please try again.',
              );
            }

            const functionCall = streamedResponseMessage.function_call;
            const functionCallResponse: ChatRequest | void =
              await experimental_onFunctionCall(
                currentMessages.data,
                functionCall,
              );

            // If the user does not return anything as a result of the function call, the loop will break.
            if (functionCallResponse === undefined) break;
            // A function call response was returned.
            // The updated chat with function call response will be sent to the API in the next iteration of the loop.
            chatRequest = functionCallResponse;
          }
        }
      }

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

      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }

  const append: UseChatHelpers['append'] = async (message, options) => {
    if (!message.id) {
      message.id = nanoid();
    }
    return triggerRequest(
      (messages() ?? []).concat(message as Message),
      options,
    );
  };

  const reload: UseChatHelpers['reload'] = async options => {
    const messagesSnapshot = messages();
    if (!messagesSnapshot || messagesSnapshot.length === 0) return null;

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

  const [input, setInput] = createSignal(initialInput);

  const handleSubmit = (e: any) => {
    e.preventDefault();
    const inputValue = input();
    if (!inputValue) return;
    append({
      content: inputValue,
      role: 'user',
      createdAt: new Date(),
    });
    setInput('');
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
    handleSubmit,
    isLoading,
    data: streamData,
  };
}
