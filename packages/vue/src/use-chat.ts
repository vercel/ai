import type {
  ChatRequestOptions,
  CreateUIMessage,
  FileUIPart,
  JSONValue,
  UIMessage,
  UseChatOptions,
} from 'ai';
import {
  callChatApi,
  convertFileListToFileUIParts,
  extractMaxToolInvocationStep,
  generateId as generateIdFunc,
  getToolInvocations,
  isAssistantMessageWithCompletedToolCalls,
  shouldResubmitMessages,
  updateToolCallResult,
} from 'ai';
import swrv from 'swrv';
import type { Ref } from 'vue';
import { ref, unref } from 'vue';

export type { CreateUIMessage, UIMessage, UseChatOptions };

export type UseChatHelpers<MESSAGE_METADATA> = {
  /** Current messages in the chat */
  messages: Ref<UIMessage<MESSAGE_METADATA>[]>;
  /** The error object of the API request */
  error: Ref<undefined | Error>;
  /**
   * Append a user message to the chat list. This triggers the API call to fetch
   * the assistant's response.
   */
  append: (
    message: UIMessage<MESSAGE_METADATA> | CreateUIMessage<MESSAGE_METADATA>,
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
    messages:
      | UIMessage<MESSAGE_METADATA>[]
      | ((
          messages: UIMessage<MESSAGE_METADATA>[],
        ) => UIMessage<MESSAGE_METADATA>[]),
  ) => void;
  /** The current value of the input */
  input: Ref<string>;
  /** Form submission handler to automatically reset input and append a user message  */
  handleSubmit: (
    event?: { preventDefault?: () => void },
    chatRequestOptions?: ChatRequestOptions & {
      files?: FileList | FileUIPart[];
    },
  ) => void;

  /**
   * Hook status:
   *
   * - `submitted`: The message has been sent to the API and we're awaiting the start of the response stream.
   * - `streaming`: The response is actively streaming in from the API, receiving chunks of data.
   * - `ready`: The full response has been received and processed; a new user message can be submitted.
   * - `error`: An error occurred during the API request, preventing successful completion.
   */
  status: Ref<'submitted' | 'streaming' | 'ready' | 'error'>;

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

// @ts-expect-error - some issues with the default export of useSWRV
const useSWRV = (swrv.default as (typeof import('swrv'))['default']) || swrv;
const store: Record<string, UIMessage<any>[] | undefined> = {};
const statusStore: Record<
  string,
  Ref<'submitted' | 'streaming' | 'ready' | 'error'>
> = {};

export function useChat<MESSAGE_METADATA = unknown>(
  {
    api = '/api/chat',
    id,
    initialMessages = [],
    initialInput = '',
    streamProtocol = 'ui-message',
    onFinish,
    onError,
    credentials,
    headers: metadataHeaders,
    body: metadataBody,
    generateId = generateIdFunc,
    onToolCall,
    fetch,
    maxSteps = 1,
    experimental_prepareRequestBody,
    messageMetadataSchema,
  }: UseChatOptions<MESSAGE_METADATA> & {
    /**
     * Experimental (Vue only). When a function is provided, it will be used
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
      messages: UIMessage<MESSAGE_METADATA>[];
      requestData?: JSONValue;
      requestBody?: object;
    }) => unknown;
  } = {
    maxSteps: 1,
  },
): UseChatHelpers<MESSAGE_METADATA> {
  // Generate a unique ID for the chat if not provided.
  const chatId = id ?? generateId();

  const key = `${api}|${chatId}`;
  const { data: messagesData, mutate: originalMutate } = useSWRV<
    UIMessage<MESSAGE_METADATA>[]
  >(key, () => store[key] ?? initialMessages);

  const status =
    statusStore[chatId] ??
    (statusStore[chatId] = ref<'submitted' | 'streaming' | 'ready' | 'error'>(
      'ready',
    ));

  // Force the `data` to be `initialMessages` if it's `undefined`.
  messagesData.value ??= initialMessages;

  const mutate = (data?: UIMessage<MESSAGE_METADATA>[]) => {
    store[key] = data;
    return originalMutate();
  };

  // Because of the `initialData` option, the `data` will never be `undefined`.
  const messages = messagesData as Ref<UIMessage<MESSAGE_METADATA>[]>;

  const error = ref<undefined | Error>(undefined);

  let abortController: AbortController | null = null;

  async function triggerRequest(
    messagesSnapshot: UIMessage<MESSAGE_METADATA>[],
    { headers, body }: ChatRequestOptions = {},
  ) {
    error.value = undefined;
    status.value = 'submitted';

    const messageCount = messages.value.length;
    const lastMessage = messages.value.at(-1);
    const maxStep =
      lastMessage != null
        ? extractMaxToolInvocationStep(getToolInvocations(lastMessage))
        : 0;

    try {
      abortController = new AbortController();

      // Do an optimistic update to show the updated messages immediately:
      mutate(messagesSnapshot);

      await callChatApi({
        api,
        body: experimental_prepareRequestBody?.({
          id: chatId,
          messages: messagesSnapshot,
          requestBody: body,
        }) ?? {
          id: chatId,
          messages: messagesSnapshot,
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
        onUpdate({ message }) {
          status.value = 'streaming';

          const replaceLastMessage =
            message.id === messagesSnapshot[messagesSnapshot.length - 1].id;

          mutate([
            ...(replaceLastMessage
              ? messagesSnapshot.slice(0, messagesSnapshot.length - 1)
              : messagesSnapshot),
            message,
          ]);
        },
        onFinish,
        generateId,
        onToolCall,
        fetch,
        // enabled use of structured clone in processChatResponse:
        lastMessage: recursiveToRaw(
          messagesSnapshot[messagesSnapshot.length - 1],
        ),
        messageMetadataSchema,
      });

      status.value = 'ready';
    } catch (err) {
      // Ignore abort errors as they are expected.
      if ((err as any).name === 'AbortError') {
        abortController = null;
        status.value = 'ready';
        return null;
      }

      if (onError && err instanceof Error) {
        onError(err);
      }

      error.value = err as Error;
      status.value = 'error';
    } finally {
      abortController = null;
    }

    // auto-submit when all tool calls in the last assistant message have results:
    if (
      shouldResubmitMessages({
        originalMaxToolInvocationStep: maxStep,
        originalMessageCount: messageCount,
        maxSteps,
        messages: messages.value,
      })
    ) {
      await triggerRequest(messages.value);
    }
  }

  const append: UseChatHelpers<MESSAGE_METADATA>['append'] = async (
    message,
    options,
  ) => {
    return triggerRequest(
      messages.value.concat({
        ...message,
        id: message.id ?? generateId(),
        parts: message.parts,
      }),
      options,
    );
  };

  const reload: UseChatHelpers<MESSAGE_METADATA>['reload'] = async options => {
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
    messagesArg:
      | UIMessage<MESSAGE_METADATA>[]
      | ((
          messages: UIMessage<MESSAGE_METADATA>[],
        ) => UIMessage<MESSAGE_METADATA>[]),
  ) => {
    if (typeof messagesArg === 'function') {
      messagesArg = messagesArg(messages.value);
    }

    mutate(messagesArg);
  };

  const input = ref(initialInput);

  const handleSubmit = async (
    event?: { preventDefault?: () => void },
    options: ChatRequestOptions & { files?: FileList | FileUIPart[] } = {},
  ) => {
    event?.preventDefault?.();

    const inputValue = input.value;

    const fileParts = Array.isArray(options?.files)
      ? options.files
      : await convertFileListToFileUIParts(options?.files);

    if (!inputValue && fileParts.length === 0) return;

    triggerRequest(
      messages.value.concat({
        id: generateId(),
        role: 'user',
        parts: [...fileParts, { type: 'text', text: inputValue }],
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
    result: unknown;
  }) => {
    const currentMessages = messages.value;

    updateToolCallResult({
      messages: currentMessages,
      toolCallId,
      toolResult: result,
    });

    mutate(currentMessages);

    // when the request is ongoing, the auto-submit will be triggered after the request is finished
    if (status.value === 'submitted' || status.value === 'streaming') {
      return;
    }

    // auto-submit when all tool calls in the last assistant message have results:
    const lastMessage = currentMessages[currentMessages.length - 1];
    if (isAssistantMessageWithCompletedToolCalls(lastMessage)) {
      triggerRequest(currentMessages);
    }
  };

  return {
    id: chatId,
    messages,
    append,
    error,
    reload,
    stop,
    setMessages,
    input,
    handleSubmit,
    status: status as Ref<'submitted' | 'streaming' | 'ready' | 'error'>,
    addToolResult,
  };
}

// required for use of structured clone
function recursiveToRaw<T>(inputValue: T): T {
  if (Array.isArray(inputValue)) {
    return [...inputValue.map(recursiveToRaw)] as T;
  } else if (typeof inputValue === 'object' && inputValue !== null) {
    const clone: any = {};
    for (const [key, value] of Object.entries(inputValue)) {
      clone[key] = recursiveToRaw(value);
    }
    return clone;
  } else {
    return inputValue;
  }
}
