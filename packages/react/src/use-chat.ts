import {
  AbstractChat,
  ChatInit,
  type CreateUIMessage,
  type UIMessage,
} from 'ai';
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { Chat } from './chat.react';

export type { CreateUIMessage, UIMessage };

export type UseChatHelpers<UI_MESSAGE extends UIMessage> = {
  /**
   * The id of the chat.
   */
<<<<<<< HEAD
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
   * Resume an ongoing chat generation stream. This does not resume an aborted generation.
   */
  experimental_resume: () => void;
=======
  readonly id: string;
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9

  /**
   * Update the `messages` state locally. This is useful when you want to
   * edit the messages on the client, and then trigger the `reload` method
   * manually to regenerate the AI response.
   */
  setMessages: (
    messages: UI_MESSAGE[] | ((messages: UI_MESSAGE[]) => UI_MESSAGE[]),
  ) => void;

  error: Error | undefined;
} & Pick<
  AbstractChat<UI_MESSAGE>,
  | 'sendMessage'
  | 'regenerate'
  | 'stop'
  | 'resumeStream'
  | 'addToolResult'
  | 'status'
  | 'messages'
>;

export type UseChatOptions<UI_MESSAGE extends UIMessage> = (
  | { chat: Chat<UI_MESSAGE> }
  | ChatInit<UI_MESSAGE>
) & {
  /**
Custom throttle wait in ms for the chat messages and data updates.
Default is undefined, which disables throttling.
   */
  experimental_throttle?: number;

  /**
   * Whether to resume an ongoing chat generation stream.
   */
  resume?: boolean;
};

export function useChat<UI_MESSAGE extends UIMessage = UIMessage>({
  experimental_throttle: throttleWaitMs,
  resume = false,
  ...options
}: UseChatOptions<UI_MESSAGE> = {}): UseChatHelpers<UI_MESSAGE> {
  const chatRef = useRef('chat' in options ? options.chat : new Chat(options));

  const subscribeToMessages = useCallback(
    (update: () => void) =>
      chatRef.current['~registerMessagesCallback'](update, throttleWaitMs),
    [throttleWaitMs],
  );

  const messages = useSyncExternalStore(
    subscribeToMessages,
    () => chatRef.current.messages,
    () => chatRef.current.messages,
  );

<<<<<<< HEAD
  // Keep the latest messages in a ref.
  const messagesRef = useRef<UIMessage[]>(messages || []);
  useEffect(() => {
    messagesRef.current = messages || [];
  }, [messages]);

  // stream data
  const { data: streamData, mutate: mutateStreamData } = useSWR<
    JSONValue[] | undefined
  >([chatKey, 'streamData'], null);

  // keep the latest stream data in a ref
  const streamDataRef = useRef<JSONValue[] | undefined>(streamData);
  useEffect(() => {
    streamDataRef.current = streamData;
  }, [streamData]);

  const { data: status = 'ready', mutate: mutateStatus } = useSWR<
    'submitted' | 'streaming' | 'ready' | 'error'
  >([chatKey, 'status'], null);

  const { data: error = undefined, mutate: setError } = useSWR<
    undefined | Error
  >([chatKey, 'error'], null);

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
    async (
      chatRequest: ChatRequest,
      requestType: 'generate' | 'resume' = 'generate',
    ) => {
      mutateStatus('submitted');
      setError(undefined);

      const chatMessages = fillMessageParts(chatRequest.messages);

      const messageCount = chatMessages.length;
      const maxStep = extractMaxToolInvocationStep(
        chatMessages[chatMessages.length - 1]?.toolInvocations,
      );

      try {
        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        const throttledMutate = throttle(mutate, throttleWaitMs);
        const throttledMutateStreamData = throttle(
          mutateStreamData,
          throttleWaitMs,
        );

        // Do an optimistic update to the chat state to show the updated messages immediately:
        const previousMessages = messagesRef.current;
        throttledMutate(chatMessages, false);

        const constructedMessagesPayload = sendExtraMessageFields
          ? chatMessages
          : chatMessages.map(
              ({
                role,
                content,
                experimental_attachments,
                data,
                annotations,
                toolInvocations,
                parts,
              }) => ({
                role,
                content,
                ...(experimental_attachments !== undefined && {
                  experimental_attachments,
                }),
                ...(data !== undefined && { data }),
                ...(annotations !== undefined && { annotations }),
                ...(toolInvocations !== undefined && { toolInvocations }),
                ...(parts !== undefined && { parts }),
              }),
            );

        const existingData = streamDataRef.current;

        await callChatApi({
          api,
          body: experimental_prepareRequestBody?.({
            id: chatId,
            messages: chatMessages,
            requestData: chatRequest.data,
            requestBody: chatRequest.body,
          }) ?? {
            id: chatId,
            messages: constructedMessagesPayload,
            data: chatRequest.data,
            ...extraMetadataRef.current.body,
            ...chatRequest.body,
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
              throttledMutate(previousMessages, false);
            }
          },
          onResponse,
          onUpdate({ message, data, replaceLastMessage }) {
            mutateStatus('streaming');

            throttledMutate(
              [
                ...(replaceLastMessage
                  ? chatMessages.slice(0, chatMessages.length - 1)
                  : chatMessages),
                message,
              ],
              false,
            );

            if (data?.length) {
              throttledMutateStreamData(
                [...(existingData ?? []), ...data],
                false,
              );
            }
          },
          onToolCall,
          onFinish,
          generateId,
          fetch,
          lastMessage: chatMessages[chatMessages.length - 1],
          requestType,
        });

        abortControllerRef.current = null;

        mutateStatus('ready');
      } catch (err) {
        // Ignore abort errors as they are expected.
        if ((err as any).name === 'AbortError') {
          abortControllerRef.current = null;
          mutateStatus('ready');
          return null;
        }

        if (onError && err instanceof Error) {
          onError(err);
        }

        setError(err as Error);
        mutateStatus('error');
      }

      // auto-submit when all tool calls in the last assistant message have results
      // and assistant has not answered yet
      const messages = messagesRef.current;
      if (
        shouldResubmitMessages({
          originalMaxToolInvocationStep: maxStep,
          originalMessageCount: messageCount,
          maxSteps,
          messages,
        })
      ) {
        await triggerRequest({ messages });
      }
    },
    [
      mutate,
      mutateStatus,
      api,
      extraMetadataRef,
      onResponse,
      onFinish,
      onError,
      setError,
      mutateStreamData,
      streamDataRef,
      streamProtocol,
      sendExtraMessageFields,
      experimental_prepareRequestBody,
      onToolCall,
      maxSteps,
      messagesRef,
      abortControllerRef,
      generateId,
      fetch,
      keepLastMessageOnError,
      throttleWaitMs,
      chatId,
    ],
  );

  const append = useCallback(
    async (
      message: Message | CreateMessage,
      {
        data,
        headers,
        body,
        experimental_attachments = message.experimental_attachments,
      }: ChatRequestOptions = {},
    ) => {
      const attachmentsForRequest = await prepareAttachmentsForRequest(
        experimental_attachments,
      );

      const messages = messagesRef.current.concat({
        ...message,
        id: message.id ?? generateId(),
        createdAt: message.createdAt ?? new Date(),
        experimental_attachments:
          attachmentsForRequest.length > 0 ? attachmentsForRequest : undefined,
        parts: getMessageParts(message),
      });

      return triggerRequest({ messages, headers, body, data });
    },
    [triggerRequest, generateId],
  );

  const reload = useCallback(
    async ({ data, headers, body }: ChatRequestOptions = {}) => {
      const messages = messagesRef.current;

      if (messages.length === 0) {
        return null;
      }

      // Remove last assistant message and retry last user message.
      const lastMessage = messages[messages.length - 1];
      return triggerRequest({
        messages:
          lastMessage.role === 'assistant' ? messages.slice(0, -1) : messages,
        headers,
        body,
        data,
      });
    },
    [triggerRequest],
  );

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const experimental_resume = useCallback(async () => {
    const messages = messagesRef.current;

    triggerRequest({ messages }, 'resume');
  }, [triggerRequest]);

=======
  const status = useSyncExternalStore(
    chatRef.current['~registerStatusCallback'],
    () => chatRef.current.status,
    () => chatRef.current.status,
  );

  const error = useSyncExternalStore(
    chatRef.current['~registerErrorCallback'],
    () => chatRef.current.error,
    () => chatRef.current.error,
  );

>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9
  const setMessages = useCallback(
    (
      messagesParam: UI_MESSAGE[] | ((messages: UI_MESSAGE[]) => UI_MESSAGE[]),
    ) => {
      if (typeof messagesParam === 'function') {
        messagesParam = messagesParam(messages);
      }

      chatRef.current.messages = messagesParam;
    },
    [messages, chatRef],
  );

  useEffect(() => {
    if (resume) {
      chatRef.current.resumeStream();
    }
  }, [resume, chatRef]);

  return {
    id: chatRef.current.id,
    messages,
    setMessages,
    sendMessage: chatRef.current.sendMessage,
    regenerate: chatRef.current.regenerate,
    stop: chatRef.current.stop,
    error,
<<<<<<< HEAD
    append,
    reload,
    stop,
    experimental_resume,
    input,
    setInput,
    handleInputChange,
    handleSubmit,
    isLoading: status === 'submitted' || status === 'streaming',
=======
    resumeStream: chatRef.current.resumeStream,
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9
    status,
    addToolResult: chatRef.current.addToolResult,
  };
}
