import { ref, reactive } from 'vue';
import type { Ref } from 'vue';
import type {
  ChatRequest,
  ChatRequestOptions,
  CreateMessage,
  JSONValue,
  Message,
  UseChatOptions as SharedUseChatOptions,
} from '@ai-sdk/ui-utils';
import {
  callChatApi,
  generateId as generateIdFunc,
  processChatStream,
} from '@ai-sdk/ui-utils';
import swrv from 'swrv';

export type { CreateMessage, Message };

export interface UseChatOptions extends SharedUseChatOptions {
  maxToolRoundtrips?: number;
}

export interface UseChatHelpers {
  /** Current messages in the chat */
  messages: Ref<Message[]>;
  /** The error object of the API request */
  error: Ref<Error | undefined>;
  /**
   * Append a user message to the chat list. This triggers the API call to fetch
   * the assistant's response.
   */
  append: (
    message: Message | CreateMessage,
    chatRequestOptions?: ChatRequestOptions,
  ) => Promise<void>;
  /**
   * Reload the last AI chat response for the given chat history. If the last
   * message isn't from the assistant, it will request the API to generate a
   * new response.
   */
  reload: (chatRequestOptions?: ChatRequestOptions) => Promise<void>;
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
    event?: Event,
    chatRequestOptions?: ChatRequestOptions,
  ) => Promise<void>;
  /** Whether the API request is in progress */
  isLoading: Ref<boolean>;
  /** Additional data added on the server via StreamData */
  data: Ref<JSONValue[] | undefined>;
  addToolResult: (params: { toolCallId: string; result: any }) => void;
}

let uniqueId = 0;

// @ts-expect-error - some issues with the default export of swrv
const useSWRV = (swrv.default as typeof import('swrv')['default']) || swrv;
const store: Record<string, Message[] | undefined> = {};

export function useChat(options: UseChatOptions = {}): UseChatHelpers {
  const {
    api = '/api/chat',
    id = `chat-${uniqueId++}`,
    initialMessages = [],
    initialInput = '',
    sendExtraMessageFields = false,
    experimental_onFunctionCall,
    experimental_onToolCall,
    onToolCall,
    streamMode,
    streamProtocol = streamMode === 'text' ? 'text' : undefined,
    onResponse,
    onFinish,
    onError,
    credentials,
    headers: metadataHeaders,
    body: metadataBody,
    generateId = generateIdFunc,
    fetch,
    keepLastMessageOnError = false,
    maxToolRoundtrips = 0,
  } = options;

  const key = `${api}|${id}`;
  const { data: messagesData, mutate: originalMutate } = useSWRV<Message[]>(
    key,
    () => store[key] || initialMessages,
  );

  const { data: isLoading, mutate: mutateLoading } = useSWRV<boolean>(
    `${id}-loading`,
    null,
  );

  isLoading.value ??= false;

  messagesData.value ??= initialMessages;

  const mutate = (data?: Message[]) => {
    store[key] = data;
    return originalMutate();
  };

  const messages = messagesData as Ref<Message[]>;

  const error = ref<Error>();
  const streamData = ref<JSONValue[]>();
  const abortController = ref<AbortController | null>(null);

  const extraMetadata = reactive({
    credentials,
    headers: metadataHeaders,
    body: metadataBody,
  });

  const input = ref(initialInput);

  async function triggerRequest(chatRequest: ChatRequest) {
    const previousMessages = [...messages.value];
    error.value = undefined;
    mutateLoading(() => true);
    abortController.value = new AbortController();

    try {
      await processChatStream({
        getStreamedResponse: async () => {
          const constructedMessagesPayload = sendExtraMessageFields
            ? chatRequest.messages
            : chatRequest.messages.map(
                ({
                  role,
                  content,
                  name,
                  function_call,
                  tool_calls,
                  tool_call_id,
                  toolInvocations,
                }) => ({
                  role,
                  content,
                  ...(name && { name }),
                  ...(function_call && { function_call }),
                  ...(tool_calls && { tool_calls }),
                  ...(tool_call_id && { tool_call_id }),
                  ...(toolInvocations && { toolInvocations }),
                }),
              );

          return await callChatApi({
            api,
            body: {
              messages: constructedMessagesPayload,
              ...extraMetadata.body,
              ...chatRequest.body,
              data: chatRequest.data,
            },
            credentials: extraMetadata.credentials,
            headers: { ...extraMetadata.headers, ...chatRequest.headers },
            abortController: () => abortController.value,
            streamProtocol,
            onResponse,
            onUpdate: (updatedMessages, data) => {
              mutate([...chatRequest.messages, ...updatedMessages]);
              streamData.value = [...(streamData.value || []), ...(data || [])];
            },
            onFinish,
            generateId,
            onToolCall,
            fetch,
            restoreMessagesOnFailure: () => {
              if (!keepLastMessageOnError) {
                mutate(previousMessages);
              }
            },
          });
        },
        experimental_onFunctionCall,
        experimental_onToolCall,
        updateChatRequest: updatedRequest =>
          Object.assign(chatRequest, updatedRequest),
        getCurrentMessages: () => messages.value,
      });

      // Check if we need to trigger another request for tool calls
      const lastMessage = messages.value[messages.value.length - 1];
      if (
        lastMessage &&
        isAssistantMessageWithCompletedToolCalls(lastMessage) &&
        countTrailingAssistantMessages(messages.value) <= maxToolRoundtrips
      ) {
        await triggerRequest({ messages: messages.value });
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        error.value = err as Error;
        onError?.(err as Error);
      }
    } finally {
      mutateLoading(() => false);
      abortController.value = null;
    }
  }

  const append = async (
    message: Message | CreateMessage,
    chatRequestOptions: ChatRequestOptions = {},
  ) => {
    const messageWithId: Message = {
      ...message,
      id: message.id || generateId(),
    };

    mutate([...messages.value, messageWithId]);

    await triggerRequest({
      ...chatRequestOptions,
      messages: messages.value,
      data: chatRequestOptions.data,
    } as ChatRequest);
  };

  const reload = async (chatRequestOptions: ChatRequestOptions = {}) => {
    if (messages.value.length === 0) return;

    const lastMessage = messages.value[messages.value.length - 1];
    if (lastMessage.role === 'assistant') {
      mutate(messages.value.slice(0, -1));
    }

    await triggerRequest({
      ...chatRequestOptions,
      messages: messages.value,
      data: chatRequestOptions.data,
    });
  };

  const stop = () => {
    if (abortController.value) {
      abortController.value.abort();
      abortController.value = null;
    }
  };

  const setMessages = (
    newMessages: Message[] | ((messages: Message[]) => Message[]),
  ) => {
    mutate(
      typeof newMessages === 'function'
        ? newMessages(messages.value)
        : newMessages,
    );
  };

  const handleSubmit = async (
    event?: Event,
    chatRequestOptions: ChatRequestOptions = {},
  ) => {
    event?.preventDefault();
    if (!input.value && !chatRequestOptions.allowEmptySubmit) return;

    const newMessage: Message = {
      id: generateId(),
      createdAt: new Date(),
      content: input.value,
      role: 'user',
    };

    input.value = '';
    await append(newMessage, chatRequestOptions);
  };

  const addToolResult = ({
    toolCallId,
    result,
  }: {
    toolCallId: string;
    result: any;
  }) => {
    const updatedMessages = messages.value.map(message => {
      if (message.role === 'assistant' && message.toolInvocations) {
        return {
          ...message,
          toolInvocations: message.toolInvocations.map(toolInvocation =>
            toolInvocation.toolCallId === toolCallId
              ? { ...toolInvocation, result }
              : toolInvocation,
          ),
        };
      }
      return message;
    });

    mutate(updatedMessages);

    const lastMessage = updatedMessages[updatedMessages.length - 1];
    if (isAssistantMessageWithCompletedToolCalls(lastMessage)) {
      triggerRequest({ messages: updatedMessages });
    }
  };

  return {
    messages,
    error,
    append,
    reload,
    stop,
    setMessages,
    input,
    handleSubmit,
    isLoading: isLoading as Ref<boolean>,
    data: streamData as Ref<undefined | JSONValue[]>,
    addToolResult,
  };
}

function isAssistantMessageWithCompletedToolCalls(message: Message): boolean {
  return (
    message.role === 'assistant' &&
    message.toolInvocations !== undefined &&
    message.toolInvocations.length > 0 &&
    message.toolInvocations.every(toolInvocation => 'result' in toolInvocation)
  );
}

function countTrailingAssistantMessages(messages: Message[]): number {
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
