import type {
  ChatRequest,
  ChatRequestOptions,
  Attachment,
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
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import useSWR, { KeyedMutator } from 'swr';

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
  setMessages: (
    messages: Message[] | ((messages: Message[]) => Message[]),
  ) => void;
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
  /** Form submission handler to automatically reset input and append a user message */
  handleSubmit: (
    event?: { preventDefault?: () => void },
    chatRequestOptions?: ChatRequestOptions,
  ) => void;
  metadata?: Object;
  /** Whether the API request is in progress */
  isLoading: boolean;
  /** Additional data added on the server via StreamData */
  data?: JSONValue[];
};

const getStreamedResponse = async (
  api: string,
  chatRequest: ChatRequest,
  mutate: KeyedMutator<Message[]>,
  mutateStreamData: KeyedMutator<JSONValue[] | undefined>,
  existingData: JSONValue[] | undefined,
  extraMetadataRef: React.MutableRefObject<any>,
  messagesRef: React.MutableRefObject<Message[]>,
  abortControllerRef: React.MutableRefObject<AbortController | null>,
  generateId: IdGenerator,
  streamProtocol: UseChatOptions['streamProtocol'],
  onFinish: UseChatOptions['onFinish'],
  onResponse: ((response: Response) => void | Promise<void>) | undefined,
  onToolCall: UseChatOptions['onToolCall'] | undefined,
  sendExtraMessageFields: boolean | undefined,
  experimental_prepareRequestBody:
    | ((options: {
        messages: Message[];
        requestData?: JSONValue;
        requestBody?: object;
      }) => JSONValue)
    | undefined,
  fetch: FetchFunction | undefined,
  keepLastMessageOnError: boolean,
) => {
  // Do an optimistic update to the chat state to show the updated messages immediately:
  const previousMessages = messagesRef.current;
  mutate(chatRequest.messages, false);

  const constructedMessagesPayload = sendExtraMessageFields
    ? chatRequest.messages
    : chatRequest.messages.map(
        ({
          role,
          content,
          experimental_attachments,
          name,
          data,
          annotations,
          toolInvocations,
          function_call,
          tool_calls,
          tool_call_id,
        }) => ({
          role,
          content,
          ...(experimental_attachments !== undefined && {
            experimental_attachments,
          }),
          ...(name !== undefined && { name }),
          ...(data !== undefined && { data }),
          ...(annotations !== undefined && { annotations }),
          ...(toolInvocations !== undefined && { toolInvocations }),
          // outdated function/tool call handling (TODO deprecate):
          tool_call_id,
          ...(function_call !== undefined && { function_call }),
          ...(tool_calls !== undefined && { tool_calls }),
        }),
      );

  return await callChatApi({
    api,
    body: experimental_prepareRequestBody?.({
      messages: chatRequest.messages,
      requestData: chatRequest.data,
      requestBody: chatRequest.body,
    }) ?? {
      messages: constructedMessagesPayload,
      data: chatRequest.data,
      ...extraMetadataRef.current.body,
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
    streamProtocol,
    credentials: extraMetadataRef.current.credentials,
    headers: {
      ...extraMetadataRef.current.headers,
      ...chatRequest.headers,
    },
    abortController: () => abortControllerRef.current,
    restoreMessagesOnFailure() {
      if (!keepLastMessageOnError) {
        mutate(previousMessages, false);
      }
    },
    onResponse,
    onUpdate(merged, data) {
      mutate([...chatRequest.messages, ...merged], false);
      mutateStreamData([...(existingData || []), ...(data || [])], false);
    },
    onToolCall,
    onFinish,
    generateId,
    fetch,
  });
};

export function useChat({
  api = '/api/chat',
  id,
  initialMessages,
  initialInput = '',
  sendExtraMessageFields,
  experimental_onFunctionCall,
  experimental_onToolCall,
  onToolCall,
  experimental_prepareRequestBody,
  experimental_maxAutomaticRoundtrips = 0,
  maxAutomaticRoundtrips = experimental_maxAutomaticRoundtrips,
  maxToolRoundtrips = maxAutomaticRoundtrips,
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
}: UseChatOptions & {
  key?: string;

  /**
@deprecated Use `maxToolRoundtrips` instead.
   */
  experimental_maxAutomaticRoundtrips?: number;

  /**
@deprecated Use `maxToolRoundtrips` instead.
   */
  maxAutomaticRoundtrips?: number;

  /**
   * Experimental (React only). When a function is provided, it will be used
   * to prepare the request body for the chat API. This can be useful for
   * customizing the request body based on the messages and data in the chat.
   *
   * @param messages The current messages in the chat.
   * @param requestData The data object passed in the chat request.
   * @param requestBody The request body object passed in the chat request.
   */
  experimental_prepareRequestBody?: (options: {
    messages: Message[];
    requestData?: JSONValue;
    requestBody?: object;
  }) => JSONValue;

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
} = {}): UseChatHelpers & {
  /**
   * @deprecated Use `addToolResult` instead.
   */
  experimental_addToolResult: ({
    toolCallId,
    result,
  }: {
    toolCallId: string;
    result: any;
  }) => void;
  addToolResult: ({
    toolCallId,
    result,
  }: {
    toolCallId: string;
    result: any;
  }) => void;
} {
  // streamMode is deprecated, use streamProtocol instead.
  if (streamMode) {
    streamProtocol ??= streamMode === 'text' ? 'text' : undefined;
  }

  // Generate a unique id for the chat if not provided.
  const hookId = useId();
  const idKey = id ?? hookId;
  const chatKey = typeof api === 'string' ? [api, idKey] : idKey;

  // Store a empty array as the initial messages
  // (instead of using a default parameter value that gets re-created each time)
  // to avoid re-renders:
  const [initialMessagesFallback] = useState([]);

  // Store the chat state in SWR, using the chatId as the key to share states.
  const { data: messages, mutate } = useSWR<Message[]>(
    [chatKey, 'messages'],
    null,
    { fallbackData: initialMessages ?? initialMessagesFallback },
  );

  // We store loading state in another hook to sync loading states across hook invocations
  const { data: isLoading = false, mutate: mutateLoading } = useSWR<boolean>(
    [chatKey, 'loading'],
    null,
  );

  const { data: streamData, mutate: mutateStreamData } = useSWR<
    JSONValue[] | undefined
  >([chatKey, 'streamData'], null);

  const { data: error = undefined, mutate: setError } = useSWR<
    undefined | Error
  >([chatKey, 'error'], null);

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

  const triggerRequest = useCallback(
    async (chatRequest: ChatRequest) => {
      const messageCount = messagesRef.current.length;

      try {
        mutateLoading(true);
        setError(undefined);

        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        await processChatStream({
          getStreamedResponse: () =>
            getStreamedResponse(
              api,
              chatRequest,
              mutate,
              mutateStreamData,
              streamData!,
              extraMetadataRef,
              messagesRef,
              abortControllerRef,
              generateId,
              streamProtocol,
              onFinish,
              onResponse,
              onToolCall,
              sendExtraMessageFields,
              experimental_prepareRequestBody,
              fetch,
              keepLastMessageOnError,
            ),
          experimental_onFunctionCall,
          experimental_onToolCall,
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
        mutateLoading(false);
      }

      // auto-submit when all tool calls in the last assistant message have results:
      const messages = messagesRef.current;
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
      streamProtocol,
      sendExtraMessageFields,
      experimental_onFunctionCall,
      experimental_onToolCall,
      experimental_prepareRequestBody,
      onToolCall,
      maxToolRoundtrips,
      messagesRef,
      abortControllerRef,
      generateId,
      fetch,
      keepLastMessageOnError,
    ],
  );

  const append = useCallback(
    async (
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
        messages: messagesRef.current.concat(message as Message),
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
    },
    [triggerRequest, generateId],
  );

  const reload = useCallback(
    async ({
      options,
      functions,
      function_call,
      tools,
      tool_choice,
      data,
      headers,
      body,
    }: ChatRequestOptions = {}) => {
      if (messagesRef.current.length === 0) return null;

      const requestOptions = {
        headers: headers ?? options?.headers,
        body: body ?? options?.body,
      };

      // Remove last assistant message and retry last user message.
      const lastMessage = messagesRef.current[messagesRef.current.length - 1];
      if (lastMessage.role === 'assistant') {
        const chatRequest: ChatRequest = {
          messages: messagesRef.current.slice(0, -1),
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
      }

      const chatRequest: ChatRequest = {
        messages: messagesRef.current,
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
    (messages: Message[] | ((messages: Message[]) => Message[])) => {
      if (typeof messages === 'function') {
        messages = messages(messagesRef.current);
      }

      mutate(messages, false);
      messagesRef.current = messages;
    },
    [mutate],
  );

  // Input state and handlers.
  const [input, setInput] = useState(initialInput);

  const handleSubmit = useCallback(
    async (
      event?: { preventDefault?: () => void },
      options: ChatRequestOptions = {},
      metadata?: Object,
    ) => {
      event?.preventDefault?.();

      if (!input && !options.allowEmptySubmit) return;

      if (metadata) {
        extraMetadataRef.current = {
          ...extraMetadataRef.current,
          ...metadata,
        };
      }

      const attachmentsForRequest: Attachment[] = [];
      const attachmentsFromOptions = options.experimental_attachments;

      if (attachmentsFromOptions) {
        if (attachmentsFromOptions instanceof FileList) {
          for (const attachment of Array.from(attachmentsFromOptions)) {
            const { name, type } = attachment;

            const dataUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = readerEvent => {
                resolve(readerEvent.target?.result as string);
              };
              reader.onerror = error => reject(error);
              reader.readAsDataURL(attachment);
            });

            attachmentsForRequest.push({
              name,
              contentType: type,
              url: dataUrl,
            });
          }
        } else if (Array.isArray(attachmentsFromOptions)) {
          for (const file of attachmentsFromOptions) {
            const { name, url, contentType } = file;

            attachmentsForRequest.push({
              name,
              contentType,
              url,
            });
          }
        } else {
          throw new Error('Invalid attachments type');
        }
      }

      const requestOptions = {
        headers: options.headers ?? options.options?.headers,
        body: options.body ?? options.options?.body,
      };

      const messages =
        !input && options.allowEmptySubmit
          ? messagesRef.current
          : messagesRef.current.concat({
              id: generateId(),
              createdAt: new Date(),
              role: 'user',
              content: input,
              experimental_attachments:
                attachmentsForRequest.length > 0
                  ? attachmentsForRequest
                  : undefined,
            });

      const chatRequest: ChatRequest = {
        messages,
        options: requestOptions,
        headers: requestOptions.headers,
        body: requestOptions.body,
        data: options.data,
      };

      triggerRequest(chatRequest);

      setInput('');
    },
    [input, generateId, triggerRequest],
  );

  const handleInputChange = (e: any) => {
    setInput(e.target.value);
  };

  const addToolResult = ({
    toolCallId,
    result,
  }: {
    toolCallId: string;
    result: any;
  }) => {
    const updatedMessages = messagesRef.current.map((message, index, arr) =>
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

    mutate(updatedMessages, false);

    // auto-submit when all tool calls in the last assistant message have results:
    const lastMessage = updatedMessages[updatedMessages.length - 1];
    if (isAssistantMessageWithCompletedToolCalls(lastMessage)) {
      triggerRequest({ messages: updatedMessages });
    }
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
    addToolResult,
    experimental_addToolResult: addToolResult,
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
