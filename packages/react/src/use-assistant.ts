/* eslint-disable react-hooks/rules-of-hooks */

import { isAbortError } from '@ai-sdk/provider-utils';
import {
  AssistantStatus,
  AssistantStreamPart,
  CreateMessage,
  Message,
  UseAssistantOptions,
  generateId,
  readDataStream,
} from '@ai-sdk/ui-utils';
import { useCallback, useRef, useState } from 'react';

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
  error: undefined | unknown;

  /**
   * The loading state of the assistant.
   */
  isLoading: boolean;
};

export function useAssistant({
  api,
  threadId: threadIdParam,
  credentials,
  headers,
  body,
  onError,
}: UseAssistantOptions): UseAssistantHelpers {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [threadId, setThreadId] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<AssistantStatus>('thread.idle');
  const [error, setError] = useState<undefined | Error>(undefined);
  const [isLoading, setIsLoading] = useState(false);

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
    setIsLoading(true);
    setStatus('thread.message.created');

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

      const result = await fetch(api, {
        method: 'POST',
        credentials,
        signal: abortController.signal,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          ...body,
          // always use user-provided threadId when available:
          threadId: threadIdParam ?? threadId ?? null,
          message: message.content,

          // optional request data:
          data: requestOptions?.data,
        }),
      });

      if (result.body == null) {
        throw new Error('The response body is empty.');
      }

      for await (const { value } of readDataStream(result.body.getReader())) {
        const { event, data } = value as AssistantStreamPart;
        setStatus(event);

        switch (event) {
          case 'thread.run.created': {
            setThreadId(data.threadId);
            break;
          }

          case 'thread.message.created': {
            setMessages(messages => [
              ...messages,
              {
                id: data.id,
                role: 'assistant',
                content: '',
              },
            ]);

            break;
          }

          case 'thread.message.delta': {
            setMessages(messages => {
              const { delta } = data;
              const lastMessage = messages[messages.length - 1];

              return [
                ...messages.slice(0, messages.length - 1),
                {
                  id: data.id,
                  role: 'assistant',
                  content: lastMessage.content + delta.content[0].text.value,
                },
              ];
            });

            break;
          }

          case 'error': {
            setError(new Error(data));
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
      setIsLoading(false);
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

  return {
    append,
    messages,
    setMessages,
    threadId,
    input,
    setInput,
    handleInputChange,
    submitMessage,
    status,
    error,
    stop,
    isLoading,
  };
}

/**
@deprecated Use `useAssistant` instead.
 */
export const experimental_useAssistant = useAssistant;
