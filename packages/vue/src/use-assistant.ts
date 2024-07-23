/**
 * A vue.js composable function to interact with the assistant API.
 */

import { isAbortError } from '@ai-sdk/provider-utils';
import { readDataStream, generateId } from '@ai-sdk/ui-utils';
import type {
  AssistantStatus,
  CreateMessage,
  Message,
  UseAssistantOptions,
} from '@ai-sdk/ui-utils';
import { computed, readonly, ref } from 'vue';
import type { ComputedRef, Ref } from 'vue';

export type UseAssistantHelpers = {
  /**
   * The current array of chat messages.
   */
  messages: Ref<Message[]>;

  /**
   * Update the message store with a new array of messages.
   */
  setMessages: (messagesProcessor: (messages: Message[]) => Message[]) => void;

  /**
   * The current thread ID.
   */
  threadId: Ref<string | undefined>;

  /**
   * Set the current thread ID. Specifying a thread ID will switch to that thread, if it exists. If set to 'undefined', a new thread will be created. For both cases, `threadId` will be updated with the new value and `messages` will be cleared.
   */
  setThreadId: (threadId: string | undefined) => void;
  /**
   * The current value of the input field.
   */
  input: Ref<string>;

  /**
   * Append a user message to the chat list. This triggers the API call to fetch
   * the assistant's response.
   * @param message The message to append
   * @param requestOptions Additional options to pass to the API call
   */
  append: (
    message: Message | CreateMessage,
    requestOptions?: {
      data?: Record<string, string>;
    },
  ) => Promise<void>;

  /**
   * Abort the current request immediately, keep the generated tokens if any.
   */
  stop: ComputedRef<() => void>;

  /**
   * Handler for the `onChange` event of the input field to control the input's value.
   */
  handleInputChange: (e: Event & { target: HTMLInputElement }) => void;

  /**
   * Handler for the `onSubmit` event of the form to append a user message and reset the input.
   */
  handleSubmit: (e: Event & { target: HTMLFormElement }) => void;

  /**
   * Whether the assistant is currently sending a message.
   */
  isSending: ComputedRef<boolean>;

  /**
   * The current status of the assistant.
   */
  status: Ref<AssistantStatus>;

  /**
   * The current error, if any.
   */
  error: Ref<Error | undefined>;
};

export function useAssistant({
  api,
  threadId: threadIdParam,
  credentials,
  headers,
  body,
  onError,
}: UseAssistantOptions): UseAssistantHelpers {
  const messages: Ref<Message[]> = ref([]);
  const input: Ref<string> = ref('');
  const currentThreadId: Ref<string | undefined> = ref(undefined);
  const status: Ref<AssistantStatus> = ref('awaiting_message');
  const error: Ref<undefined | Error> = ref(undefined);

  const setMessages = (messageFactory: (messages: Message[]) => Message[]) => {
    messages.value = messageFactory(messages.value);
  };

  const setCurrentThreadId = (newThreadId: string | undefined) => {
    currentThreadId.value = newThreadId;
    messages.value = [];
  };

  const handleInputChange = (event: Event & { target: HTMLInputElement }) => {
    input.value = event?.target?.value;
  };

  const isSending = computed(() => status.value === 'in_progress');

  // Abort controller to cancel the current API call when required
  const abortController = ref<AbortController | null>(null);

  // memoized function to stop the current request when required
  const stop = computed(() => {
    return () => {
      if (abortController.value) {
        abortController.value.abort();
        abortController.value = null;
      }
    };
  });

  const append = async (
    message: Message | CreateMessage,
    requestOptions?: {
      data?: Record<string, string>;
    },
  ) => {
    status.value = 'in_progress';

    // Append the new message to the current list of messages
    const newMessage: Message = {
      ...message,
      id: message.id ?? generateId(),
    };

    // Update the messages list with the new message
    setMessages(messages => [...messages, newMessage]);

    input.value = '';

    const controller = new AbortController();

    try {
      // Assign the new controller to the abortController ref
      abortController.value = controller;

      const response = await fetch(api, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({
          ...body,
          // Message Content
          message: message.content,

          // Always Use User Provided Thread ID When Available
          threadId: threadIdParam ?? currentThreadId.value ?? null,

          // Optional Request Data
          ...(requestOptions?.data && { data: requestOptions?.data }),
        }),
        signal: controller.signal,
        credentials,
      });

      if (!response.ok) {
        throw new Error(
          response.statusText ?? 'An error occurred while sending the message',
        );
      }

      if (!response.body) {
        throw new Error('The response body is empty');
      }

      for await (const { type, value } of readDataStream(
        response.body.getReader(),
      )) {
        switch (type) {
          case 'assistant_message': {
            messages.value = [
              ...messages.value,
              {
                id: value.id,
                content: value.content[0].text.value,
                role: value.role,
              },
            ];
            break;
          }
          case 'assistant_control_data': {
            if (value.threadId) {
              currentThreadId.value = value.threadId;
            }

            setMessages(messages => {
              const lastMessage = messages[messages.length - 1];
              lastMessage.id = value.messageId;

              return [...messages.slice(0, -1), lastMessage];
            });

            break;
          }

          case 'text': {
            setMessages(messages => {
              const lastMessage = messages[messages.length - 1];
              lastMessage.content += value;

              return [...messages.slice(0, -1), lastMessage];
            });

            break;
          }

          case 'data_message': {
            setMessages(messages => [
              ...messages,
              {
                id: value.id ?? generateId(),
                role: 'data',
                content: '',
                data: value.data,
              },
            ]);
            break;
          }

          case 'error': {
            error.value = new Error(value);
          }

          default: {
            console.error('Unknown message type:', type);
            break;
          }
        }
      }
    } catch (err) {
      // If the error is an AbortError and the signal is aborted, reset the abortController and do nothing.
      if (isAbortError(err) && abortController.value?.signal.aborted) {
        abortController.value = null;
        return;
      }

      // If an error handler is provided, call it with the error
      if (onError && err instanceof Error) {
        onError(err);
      }

      error.value = err as Error;
    } finally {
      // Reset the status to 'awaiting_message' after the request is complete
      abortController.value = null;
      status.value = 'awaiting_message';
    }
  };

  const submitMessage = async (
    event: Event & { target: HTMLFormElement },
    requestOptions?: {
      data?: Record<string, string>;
    },
  ) => {
    event?.preventDefault?.();

    if (!input.value) return;

    append(
      {
        role: 'user',
        content: input.value,
      },
      requestOptions,
    );
  };

  return {
    append,
    messages,
    setMessages,
    threadId: readonly(currentThreadId),
    setThreadId: setCurrentThreadId,
    input,
    handleInputChange,
    handleSubmit: submitMessage,
    isSending,
    status,
    error,
    stop,
  };
}

/**
 * @deprecated Use `useAssistant` instead.
 */
export const experimental_useAssistant = useAssistant;
