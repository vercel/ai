import { Accessor, Resource, Setter, createSignal } from 'solid-js';
import { useSWRStore } from 'solid-swr-store';
import { createSWRStore } from 'swr-store';
import { callChatApi } from '../shared/call-chat-api';
import { generateId as generateIdFunc } from '../shared/generate-id';
import { processChatStream } from '../shared/process-chat-stream';
import type {
  ChatRequest,
  ChatRequestOptions,
  CreateMessage,
  JSONValue,
  Message,
  UseChatOptions,
} from '../shared/types';

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
  setMessages: (messages: Message[]) => void;
  /** The current value of the input */
  input: Accessor<string>;
  /** Signal setter to update the input value */
  setInput: Setter<string>;
  /** Form submission handler to automatically reset input and append a user message */
  handleSubmit: (e: any, chatRequestOptions?: ChatRequestOptions) => void;
  /** Whether the API request is in progress */
  isLoading: Accessor<boolean>;
  /** Additional data added on the server via StreamData */
  data: Accessor<JSONValue[] | undefined>;
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
  experimental_onToolCall,
  onResponse,
  onFinish,
  onError,
  credentials,
  headers,
  body,
  streamMode,
  generateId = generateIdFunc,
}: Omit<UseChatOptions, 'api'> & {
  api?: string;
  key?: string;
} = {}): UseChatHelpers & {
  experimental_addToolResult: ({
    toolCallId,
    result,
  }: {
    toolCallId: string;
    result: any;
  }) => void;
} {
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
  const [streamData, setStreamData] = createSignal<JSONValue[] | undefined>(
    undefined,
  );
  const [isLoading, setIsLoading] = createSignal(false);

  let abortController: AbortController | null = null;
  async function triggerRequest(
    messagesSnapshot: Message[],
    {
      options,
      data,
      functions,
      function_call,
      tools,
      tool_choice,
    }: ChatRequestOptions = {},
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

      const constructedMessagesPayload = sendExtraMessageFields
        ? messagesSnapshot
        : messagesSnapshot.map(
            ({
              role,
              content,
              name,
              toolInvocations,
              function_call,
              tool_calls,
              tool_call_id,
            }) => ({
              id: generateId(),
              role,
              content,
              ...(name !== undefined && { name }),
              ...(toolInvocations !== undefined && { toolInvocations }),
              // outdated function/tool call handling (TODO deprecate):
              tool_call_id,
              ...(function_call !== undefined && { function_call }),
              ...(tool_calls !== undefined && { tool_calls }),
            }),
          );

      let chatRequest: ChatRequest = {
        messages: constructedMessagesPayload,
        options,
        data,
        ...(functions !== undefined && { functions }),
        ...(function_call !== undefined && { function_call }),
        ...(tools !== undefined && { tools }),
        ...(tool_choice !== undefined && { tool_choice }),
      };

      await processChatStream({
        getStreamedResponse: async () => {
          const existingData = streamData() ?? [];

          return await callChatApi({
            api,
            messages: constructedMessagesPayload,
            body: {
              data: chatRequest.data,
              ...body,
              ...options?.body,
              ...(functions !== undefined && {
                functions,
              }),
              ...(function_call !== undefined && {
                function_call,
              }),
              ...(tools !== undefined && {
                tools,
              }),
              ...(tool_choice !== undefined && {
                tool_choice,
              }),
            },
            streamMode,
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
            restoreMessagesOnFailure() {
              // Restore the previous messages if the request fails.
              if (previousMessages.status === 'success') {
                mutate(previousMessages.data);
              }
            },
            generateId,
          });
        },
        experimental_onFunctionCall,
        experimental_onToolCall,
        updateChatRequest(newChatRequest) {
          chatRequest = newChatRequest;
        },
        getCurrentMessages: () => getCurrentMessages().data,
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

      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }

  const append: UseChatHelpers['append'] = async (message, options) => {
    if (!message.id) {
      message.id = generateId();
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

  const handleSubmit = (e: any, options: ChatRequestOptions = {}) => {
    e.preventDefault();
    const inputValue = input();
    if (!inputValue) return;

    append(
      {
        content: inputValue,
        role: 'user',
        createdAt: new Date(),
      },
      options,
    );

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
    experimental_addToolResult: ({
      toolCallId,
      result,
    }: {
      toolCallId: string;
      result: any;
    }) => {
      const updatedMessages = (messages() ?? []).map((message, index, arr) =>
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
      const lastMessage = updatedMessages.at(-1);
      if (
        lastMessage?.role === 'assistant' &&
        lastMessage.toolInvocations &&
        lastMessage.toolInvocations.length > 0 &&
        lastMessage.toolInvocations.every(
          toolInvocation => 'result' in toolInvocation,
        )
      ) {
        triggerRequest(updatedMessages);
      }
    },
  };
}
