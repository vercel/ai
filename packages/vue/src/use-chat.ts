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
  prepareAttachmentsForRequest,
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

  /** Additional data added on the server via StreamData. */
  data: Ref<JSONValue[] | undefined>;
  /** Set the data of the chat. You can use this to transform or clear the chat data. */
  setData: (
    data:
      | JSONValue[]
      | undefined
      | ((data: JSONValue[] | undefined) => JSONValue[] | undefined),
  ) => void;

  addToolResult: ({
    toolCallId,
    result,
  }: {
    toolCallId: string;
    result: any;
  }) => void;
};

let uniqueId = 0;

// @ts-expect-error - some issues with the default export of useSWRV
const useSWRV = (swrv.default as typeof import('swrv')['default']) || swrv;
const store: Record<string, Message[] | undefined> = {};

export function useChat(
  {
    api = '/api/chat',
    id,
    initialMessages = [],
    initialInput = '',
    sendExtraMessageFields,
    streamProtocol = 'data',
    onResponse,
    onFinish,
    onError,
    credentials,
    headers: metadataHeaders,
    body: metadataBody,
    generateId = generateIdFunc,
    onToolCall,
    fetch,
    keepLastMessageOnError = true,
    maxSteps,
  }: UseChatOptions & {
    /**
     * Maximum number of sequential LLM calls (steps), e.g. when you use tool calls. Must be at least 1.
     * A maximum number is required to prevent infinite loops in the case of misconfigured tools.
     * By default, it's set to 1, which means that only a single LLM call is made.
     */
    maxSteps?: number;
  } = {
    maxSteps: 1,
  },
): UseChatHelpers {
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
    { data, headers, body }: ChatRequestOptions = {},
  ) {
    const messageCount = messages.value.length;

    try {
      error.value = undefined;
      mutateLoading(() => true);

      abortController = new AbortController();

      // Do an optimistic update to the chat state to show the updated messages
      // immediately.
      const previousMessages = messagesSnapshot;
      mutate(messagesSnapshot);

      const chatRequest: ChatRequest = {
        messages: messagesSnapshot,
        body,
        headers,
        data,
      };

      const existingData = (streamData.value ?? []) as JSONValue[];

      const constructedMessagesPayload = sendExtraMessageFields
        ? chatRequest.messages
        : chatRequest.messages.map(
            ({
              role,
              content,
              experimental_attachments,
              data,
              annotations,
              toolInvocations,
            }) => ({
              role,
              content,
              ...(experimental_attachments !== undefined && {
                experimental_attachments,
              }),
              ...(data !== undefined && { data }),
              ...(annotations !== undefined && { annotations }),
              ...(toolInvocations !== undefined && { toolInvocations }),
            }),
          );

      await callChatApi({
        api,
        body: {
          messages: constructedMessagesPayload,
          data: chatRequest.data,
          ...unref(metadataBody), // Use unref to unwrap the ref value
          ...body,
        },
        streamProtocol,
        headers: {
          ...metadataHeaders,
          ...headers,
        },
        abortController: () => abortController,
        credentials,
        onResponse,
        onUpdate(merged, data) {
          mutate([...chatRequest.messages, ...merged]);
          if (data?.length) {
            streamData.value = [...existingData, ...data];
          }
        },
        onFinish,
        restoreMessagesOnFailure() {
          // Restore the previous messages if the request fails.
          if (!keepLastMessageOnError) {
            mutate(previousMessages);
          }
        },
        generateId,
        onToolCall,
        fetch,
      });
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
      abortController = null;
      mutateLoading(() => false);
    }

    // auto-submit when all tool calls in the last assistant message have results:
    const lastMessage = messages.value[messages.value.length - 1];
    if (
      // ensure we actually have new messages (to prevent infinite loops in case of errors):
      messages.value.length > messageCount &&
      // ensure there is a last message:
      lastMessage != null &&
      // check if the feature is enabled:
      maxSteps &&
      maxSteps > 1 &&
      // check that next step is possible:
      isAssistantMessageWithCompletedToolCalls(lastMessage) &&
      // limit the number of automatic steps:
      countTrailingAssistantMessages(messages.value) <= maxSteps
    ) {
      await triggerRequest(messages.value);
    }
  }

  const append: UseChatHelpers['append'] = async (message, options) => {
    const attachmentsForRequest = await prepareAttachmentsForRequest(
      options?.experimental_attachments,
    );

    return triggerRequest(
      messages.value.concat({
        ...message,
        id: message.id ?? generateId(),
        createdAt: message.createdAt ?? new Date(),
        experimental_attachments:
          attachmentsForRequest.length > 0 ? attachmentsForRequest : undefined,
      }),
      options,
    );
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

  const setData = (
    dataArg:
      | JSONValue[]
      | undefined
      | ((data: JSONValue[] | undefined) => JSONValue[] | undefined),
  ) => {
    if (typeof dataArg === 'function') {
      dataArg = dataArg(streamData.value as JSONValue[] | undefined);
    }

    streamData.value = dataArg;
  };

  const input = ref(initialInput);

  const handleSubmit = async (
    event?: { preventDefault?: () => void },
    options: ChatRequestOptions = {},
  ) => {
    event?.preventDefault?.();

    const inputValue = input.value;

    if (!inputValue && !options.allowEmptySubmit) return;

    const attachmentsForRequest = await prepareAttachmentsForRequest(
      options.experimental_attachments,
    );

    triggerRequest(
      !inputValue && !attachmentsForRequest.length && options.allowEmptySubmit
        ? messages.value
        : messages.value.concat({
            id: generateId(),
            createdAt: new Date(),
            content: inputValue,
            role: 'user',
            experimental_attachments:
              attachmentsForRequest.length > 0
                ? attachmentsForRequest
                : undefined,
          }),
      options,
    );

    input.value = '';
  };

  const addToolResult = ({
    toolCallId,
    result,
  }: {
    toolCallId: string;
    result: any;
  }) => {
    const updatedMessages = messages.value.map((message, index, arr) =>
      // update the tool calls in the last assistant message:
      index === arr.length - 1 &&
      message.role === 'assistant' &&
      message.toolInvocations
        ? {
            ...message,
            toolInvocations: message.toolInvocations.map(toolInvocation =>
              toolInvocation.toolCallId === toolCallId
                ? {
                    ...toolInvocation,
                    result,
                    state: 'result' as const,
                  }
                : toolInvocation,
            ),
          }
        : message,
    );

    mutate(updatedMessages);

    // auto-submit when all tool calls in the last assistant message have results:
    const lastMessage = updatedMessages[updatedMessages.length - 1];

    if (isAssistantMessageWithCompletedToolCalls(lastMessage)) {
      triggerRequest(updatedMessages);
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
    handleSubmit,
    isLoading,
    data: streamData as Ref<undefined | JSONValue[]>,
    setData,
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
