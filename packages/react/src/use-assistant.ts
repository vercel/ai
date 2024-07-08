import { isAbortError } from '@ai-sdk/provider-utils';
import {
  AssistantStatus,
  CreateMessage,
  Message,
  UseAssistantOptions,
  generateId,
  readDataStream,
} from '@ai-sdk/ui-utils';
import { useCallback, useRef, useState } from 'react';

// use function to allow for mocking in tests:
const getOriginalFetch = () => fetch;

export type UseAssistantHelpers = {
  /**
   * The current array of chat messages.
   */
  messages: Message[];

  /**
   * Update the message store with a new array of messages.
   */
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;

  /**
   * The current thread ID.
   */
  threadId: string | undefined;

  /**
   * Set the current thread ID. Specifying a thread ID will switch to that thread, if it exists. If set to 'undefined', a new thread will be created. For both cases, `threadId` will be updated with the new value and `messages` will be cleared.
   */
  setThreadId: (threadId: string | undefined) => void;

  /**
   * The current value of the input field.
   */
  input: string;

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
Abort the current request immediately, keep the generated tokens if any.
   */
  stop: () => void;

  /**
   * setState-powered method to update the input value.
   */
  setInput: React.Dispatch<React.SetStateAction<string>>;

  /**
   * Handler for the `onChange` event of the input field to control the input's value.
   */
  handleInputChange: (
    event:
      | React.ChangeEvent<HTMLInputElement>
      | React.ChangeEvent<HTMLTextAreaElement>,
  ) => void;

  /**
   * Form submission handler that automatically resets the input field and appends a user message.
   */
  submitMessage: (
    event?: React.FormEvent<HTMLFormElement>,
    requestOptions?: {
      data?: Record<string, string>;
    },
  ) => Promise<void>;

  /**
   * The current status of the assistant. This can be used to show a loading indicator.
   */
  status: AssistantStatus;

  /**
   * The error thrown during the assistant message processing, if any.
   */
  error: undefined | Error;
};

export function useAssistant({
  api,
  threadId: threadIdParam,
  credentials,
  headers,
  body,
  onError,
  fetch,
}: UseAssistantOptions): UseAssistantHelpers {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [currentThreadId, setCurrentThreadId] = useState<string | undefined>(
    undefined,
  );
  const [status, setStatus] = useState<AssistantStatus>('awaiting_message');
  const [error, setError] = useState<undefined | Error>(undefined);

  const handleInputChange = (
    event:
      | React.ChangeEvent<HTMLInputElement>
      | React.ChangeEvent<HTMLTextAreaElement>,
  ) => {
    setInput(event.target.value);
  };

  // Abort controller to cancel the current API call.
  const abortControllerRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const append = async (
    message: Message | CreateMessage,
    requestOptions?: {
      data?: Record<string, string>;
    },
  ) => {
    setStatus('in_progress');

    setMessages(messages => [
      ...messages,
      {
        ...message,
        id: message.id ?? generateId(),
      },
    ]);

    setInput('');

    const abortController = new AbortController();

    try {
      abortControllerRef.current = abortController;

      const actualFetch = fetch ?? getOriginalFetch();
      const response = await actualFetch(api, {
        method: 'POST',
        credentials,
        signal: abortController.signal,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          ...body,
          // always use user-provided threadId when available:
          threadId: threadIdParam ?? currentThreadId ?? null,
          message: message.content,

          // optional request data:
          data: requestOptions?.data,
        }),
      });

      if (!response.ok) {
        throw new Error(
          (await response.text()) ?? 'Failed to fetch the assistant response.',
        );
      }

      if (response.body == null) {
        throw new Error('The response body is empty.');
      }

      for await (const { type, value } of readDataStream(
        response.body.getReader(),
      )) {
        switch (type) {
          case 'assistant_message': {
            setMessages(messages => [
              ...messages,
              {
                id: value.id,
                role: value.role,
                content: value.content[0].text.value,
              },
            ]);
            break;
          }

          case 'text': {
            // text delta - add to last message:
            setMessages(messages => {
              const lastMessage = messages[messages.length - 1];
              return [
                ...messages.slice(0, messages.length - 1),
                {
                  id: lastMessage.id,
                  role: lastMessage.role,
                  content: lastMessage.content + value,
                },
              ];
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

          case 'assistant_control_data': {
            setCurrentThreadId(value.threadId);

            // set id of last message:
            setMessages(messages => {
              const lastMessage = messages[messages.length - 1];
              lastMessage.id = value.messageId;
              return [...messages.slice(0, messages.length - 1), lastMessage];
            });

            break;
          }

          case 'error': {
            setError(new Error(value));
            break;
          }
        }
      }
    } catch (error) {
      // Ignore abort errors as they are expected when the user cancels the request:
      if (isAbortError(error) && abortController.signal.aborted) {
        abortControllerRef.current = null;
        return;
      }

      if (onError && error instanceof Error) {
        onError(error);
      }

      setError(error as Error);
    } finally {
      abortControllerRef.current = null;
      setStatus('awaiting_message');
    }
  };

  const submitMessage = async (
    event?: React.FormEvent<HTMLFormElement>,
    requestOptions?: {
      data?: Record<string, string>;
    },
  ) => {
    event?.preventDefault?.();

    if (input === '') {
      return;
    }

    append({ role: 'user', content: input }, requestOptions);
  };

  const setThreadId = (threadId: string | undefined) => {
    setCurrentThreadId(threadId);
    setMessages([]);
  };

  return {
    append,
    messages,
    setMessages,
    threadId: currentThreadId,
    setThreadId,
    input,
    setInput,
    handleInputChange,
    submitMessage,
    status,
    error,
    stop,
  };
}

/**
@deprecated Use `useAssistant` instead.
 */
export const experimental_useAssistant = useAssistant;
