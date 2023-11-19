import { useCallback, useEffect, useId, useRef, useState } from 'react';
import useSWR, { KeyedMutator } from 'swr';
import { nanoid } from '../shared/utils';

import type {
  ChatRequest,
  ChatRequestOptions,
  CreateMessage,
  JSONValue,
  Message,
  UseChatOptions,
} from '../shared/types';

import { callApi } from '../shared/call-api';
import { processChatStream } from '../shared/process-chat-stream';
import type {
  ReactResponseRow,
  experimental_StreamingReactResponse,
} from '../streams/streaming-react-response';
export type { CreateMessage, Message, UseChatOptions };

export type UseChatHelpers = {
  /** Current messages in the chat */
  messages: Message[];
  /** The error object of the API request */
  error: undefined | Error;
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
  input: string;
  /** setState-powered method to update the input value */
  setInput: React.Dispatch<React.SetStateAction<string>>;
  /** An input/textarea-ready onChange handler to control the value of the input */
  handleInputChange: (
    e:
      | React.ChangeEvent<HTMLInputElement>
      | React.ChangeEvent<HTMLTextAreaElement>,
  ) => void;
  /** Form submission handler to automatically reset input and append a user message  */
  handleSubmit: (
    e: React.FormEvent<HTMLFormElement>,
    chatRequestOptions?: ChatRequestOptions,
  ) => void;
  metadata?: Object;
  /** Whether the API request is in progress */
  isLoading: boolean;
  /** Additional data added on the server via StreamData */
  data?: JSONValue[] | undefined;
};

type StreamingReactResponseAction = (payload: {
  messages: Message[];
  data?: Record<string, string>;
}) => Promise<experimental_StreamingReactResponse>;

const getStreamedResponse = async (
  api: string | StreamingReactResponseAction,
  chatRequest: ChatRequest,
  mutate: KeyedMutator<Message[]>,
  mutateStreamData: KeyedMutator<JSONValue[] | undefined>,
  existingData: JSONValue[] | undefined,
  extraMetadataRef: React.MutableRefObject<any>,
  messagesRef: React.MutableRefObject<Message[]>,
  abortControllerRef: React.MutableRefObject<AbortController | null>,
  onFinish?: (message: Message) => void,
  onResponse?: (response: Response) => void | Promise<void>,
  sendExtraMessageFields?: boolean,
) => {
  // Do an optimistic update to the chat state to show the updated messages
  // immediately.
  const previousMessages = messagesRef.current;
  mutate(chatRequest.messages, false);

  const constructedMessagesPayload = sendExtraMessageFields
    ? chatRequest.messages
    : chatRequest.messages.map(({ role, content, name, function_call }) => ({
        role,
        content,
        ...(name !== undefined && { name }),
        ...(function_call !== undefined && {
          function_call: function_call,
        }),
      }));

  if (typeof api !== 'string') {
    // In this case, we are handling a Server Action. No complex mode handling needed.

    const replyId = nanoid();
    const createdAt = new Date();
    let responseMessage: Message = {
      id: replyId,
      createdAt,
      content: '',
      role: 'assistant',
    };

    async function readRow(promise: Promise<ReactResponseRow>) {
      const { content, ui, next } = await promise;

      // TODO: Handle function calls.
      responseMessage['content'] = content;
      responseMessage['ui'] = await ui;

      mutate([...chatRequest.messages, { ...responseMessage }], false);

      if (next) {
        await readRow(next);
      }
    }

    try {
      const promise = api({
        messages: constructedMessagesPayload as Message[],
        data: chatRequest.data,
      }) as Promise<ReactResponseRow>;
      await readRow(promise);
    } catch (e) {
      // Restore the previous messages if the request fails.
      mutate(previousMessages, false);
      throw e;
    }

    if (onFinish) {
      onFinish(responseMessage);
    }

    return responseMessage;
  }

  return await callApi({
    api,
    messages: constructedMessagesPayload,
    body: {
      data: chatRequest.data,
      ...extraMetadataRef.current.body,
      ...chatRequest.options?.body,
      ...(chatRequest.functions !== undefined && {
        functions: chatRequest.functions,
      }),
      ...(chatRequest.function_call !== undefined && {
        function_call: chatRequest.function_call,
      }),
    },
    credentials: extraMetadataRef.current.credentials,
    headers: {
      ...extraMetadataRef.current.headers,
      ...chatRequest.options?.headers,
    },
    abortController: () => abortControllerRef.current,
    appendMessage(message) {
      mutate([...chatRequest.messages, message], false);
    },
    restoreMessagesOnFailure() {
      mutate(previousMessages, false);
    },
    onResponse,
    onUpdate(merged, data) {
      mutate([...chatRequest.messages, ...merged], false);
      mutateStreamData([...(existingData || []), ...(data || [])], false);
    },
    onFinish,
  });
};

export function useChat({
  api = '/api/chat',
  id,
  initialMessages,
  initialInput = '',
  sendExtraMessageFields,
  experimental_onFunctionCall,
  onResponse,
  onFinish,
  onError,
  credentials,
  headers,
  body,
}: Omit<UseChatOptions, 'api'> & {
  api?: string | StreamingReactResponseAction;
} = {}): UseChatHelpers {
  // Generate a unique id for the chat if not provided.
  const hookId = useId();
  const chatId = id || hookId;

  // Store a empty array as the initial messages
  // (instead of using a default parameter value that gets re-created each time)
  // to avoid re-renders:
  const [initialMessagesFallback] = useState([]);

  // Store the chat state in SWR, using the chatId as the key to share states.
  const { data: messages, mutate } = useSWR<Message[]>([api, chatId], null, {
    fallbackData: initialMessages ?? initialMessagesFallback,
  });

  // We store loading state in another hook to sync loading states across hook invocations
  const { data: isLoading = false, mutate: mutateLoading } = useSWR<boolean>(
    [chatId, 'loading'],
    null,
  );

  const { data: isPending = false, mutate: mutatePending } = useSWR<boolean>(
    [chatId, 'pending'],
    null,
  );

  const { data: streamData, mutate: mutateStreamData } = useSWR<
    JSONValue[] | undefined
  >([chatId, 'streamData'], null);

  // Keep the latest messages in a ref.
  const messagesRef = useRef<Message[]>(messages || []);
  useEffect(() => {
    messagesRef.current = messages || [];
  }, [messages]);

  // Abort controller to cancel the current API call.
  const abortControllerRef = useRef<AbortController | null>(null);

  const extraMetadataRef = useRef({
    credentials,
    headers,
    body,
  });
  useEffect(() => {
    extraMetadataRef.current = {
      credentials,
      headers,
      body,
    };
  }, [credentials, headers, body]);

  // Actual mutation hook to send messages to the API endpoint and update the
  // chat state.
  const [error, setError] = useState<undefined | Error>();

  const triggerRequest = useCallback(
    async (chatRequest: ChatRequest) => {
      try {
        mutateLoading(true);
        mutatePending(true);
        setError(undefined);

        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        await processChatStream({
          getStreamedResponse: () => {
            mutatePending(false);
            return getStreamedResponse(
              api,
              chatRequest,
              mutate,
              mutateStreamData,
              streamData!,
              extraMetadataRef,
              messagesRef,
              abortControllerRef,
              onFinish,
              onResponse,
              sendExtraMessageFields,
            )
          },
          experimental_onFunctionCall,
          updateChatRequest: chatRequestParam => {
            chatRequest = chatRequestParam;
          },
          getCurrentMessages: () => messagesRef.current,
        });

        abortControllerRef.current = null;
      } catch (err) {
        // Ignore abort errors as they are expected.
        if ((err as any).name === 'AbortError') {
          abortControllerRef.current = null;
          return null;
        }

        if (onError && err instanceof Error) {
          onError(err);
        }

        setError(err as Error);
      } finally {
        mutatePending(false);
        mutateLoading(false);
      }
    },
    [
      mutate,
      mutateLoading,
      api,
      extraMetadataRef,
      onResponse,
      onFinish,
      onError,
      setError,
      mutateStreamData,
      streamData,
      sendExtraMessageFields,
      experimental_onFunctionCall,
      messagesRef.current,
      abortControllerRef.current,
    ],
  );

  const append = useCallback(
    async (
      message: Message | CreateMessage,
      { options, functions, function_call, data }: ChatRequestOptions = {},
    ) => {
      if (!message.id) {
        message.id = nanoid();
      }

      const chatRequest: ChatRequest = {
        messages: messagesRef.current.concat(message as Message),
        options,
        data,
        ...(functions !== undefined && { functions }),
        ...(function_call !== undefined && { function_call }),
      };

      return triggerRequest(chatRequest);
    },
    [triggerRequest],
  );

  const reload = useCallback(
    async ({ options, functions, function_call }: ChatRequestOptions = {}) => {
      if (messagesRef.current.length === 0) return null;

      // Remove last assistant message and retry last user message.
      const lastMessage = messagesRef.current[messagesRef.current.length - 1];
      if (lastMessage.role === 'assistant') {
        const chatRequest: ChatRequest = {
          messages: messagesRef.current.slice(0, -1),
          options,
          ...(functions !== undefined && { functions }),
          ...(function_call !== undefined && { function_call }),
        };

        return triggerRequest(chatRequest);
      }

      const chatRequest: ChatRequest = {
        messages: messagesRef.current,
        options,
        ...(functions !== undefined && { functions }),
        ...(function_call !== undefined && { function_call }),
      };

      return triggerRequest(chatRequest);
    },
    [triggerRequest],
  );

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const setMessages = useCallback(
    (messages: Message[]) => {
      mutate(messages, false);
      messagesRef.current = messages;
    },
    [mutate],
  );

  // Input state and handlers.
  const [input, setInput] = useState(initialInput);

  const handleSubmit = useCallback(
    (
      e: React.FormEvent<HTMLFormElement>,
      options: ChatRequestOptions = {},
      metadata?: Object,
    ) => {
      if (metadata) {
        extraMetadataRef.current = {
          ...extraMetadataRef.current,
          ...metadata,
        };
      }

      e.preventDefault();
      if (!input) return;

      append(
        {
          content: input,
          role: 'user',
          createdAt: new Date(),
        },
        options,
      );
      setInput('');
    },
    [input, append],
  );

  const handleInputChange = (e: any) => {
    setInput(e.target.value);
  };

  return {
    messages: messages || [],
    error,
    append,
    reload,
    stop,
    setMessages,
    input,
    setInput,
    handleInputChange,
    handleSubmit,
    isLoading,
    data: streamData,
  };
}
