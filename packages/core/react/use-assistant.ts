/* eslint-disable react-hooks/rules-of-hooks */

import { useState } from 'react';
import { readDataStream } from '../shared/read-data-stream';
import { Message } from '../shared/types';
import { parseStreamPart } from '../shared/stream-parts';

export type AssistantStatus = 'in_progress' | 'awaiting_message';

export type UseAssistantHelpers = {
  /** Current messages in the chat */
  messages: Message[];

  /** Current thread ID */
  threadId: string | undefined;

  /** The current value of the input */
  input: string;

  /** An input/textarea-ready onChange handler to control the value of the input */
  handleInputChange: (
    event:
      | React.ChangeEvent<HTMLInputElement>
      | React.ChangeEvent<HTMLTextAreaElement>,
  ) => void;

  /** Form submission handler to automatically reset input and append a user message  */
  submitMessage: (
    event?: React.FormEvent<HTMLFormElement>,
    requestOptions?: {
      data?: Record<string, string>;
    },
  ) => Promise<void>;

  /** Current status of the assistant */
  status: AssistantStatus;

  /** Current error, if any */
  error: undefined | unknown;
};

export type UseAssistantOptions = {
  api: string;
  threadId?: string | undefined;
  credentials?: RequestCredentials;
  headers?: Record<string, string> | Headers;
  body?: object;
  onError?: (error: Error) => void;
};

export function experimental_useAssistant({
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
  const [status, setStatus] = useState<AssistantStatus>('awaiting_message');
  const [error, setError] = useState<undefined | Error>(undefined);

  const handleInputChange = (
    event:
      | React.ChangeEvent<HTMLInputElement>
      | React.ChangeEvent<HTMLTextAreaElement>,
  ) => {
    setInput(event.target.value);
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

    setStatus('in_progress');

    setMessages(messages => [
      ...messages,
      { id: '', role: 'user', content: input },
    ]);

    setInput('');

    const result = await fetch(api, {
      method: 'POST',
      credentials,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({
        ...body,
        // always use user-provided threadId when available:
        threadId: threadIdParam ?? threadId ?? null,
        message: input,

        // optional request data:
        data: requestOptions?.data,
      }),
    });

    if (result.body == null) {
      throw new Error('The response body is empty.');
    }

    try {
      for await (const { type, value } of readDataStream(
        result.body.getReader(),
      )) {
        switch (type) {
          case 'assistant_message': {
            // append message:
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

          case 'assistant_control_data': {
            setThreadId(value.threadId);

            // set id of last message:
            setMessages(messages => {
              const lastMessage = messages[messages.length - 1];
              lastMessage.id = value.messageId;
              return [...messages.slice(0, messages.length - 1), lastMessage];
            });

            break;
          }

          case 'error': {
            setError(value);
            break;
          }
        }
      }
    } catch (error) {
      if (onError && error instanceof Error) {
        onError(error);
      }

      setError(error as Error);
    }

    setStatus('awaiting_message');
  };

  return {
    messages,
    threadId,
    input,
    handleInputChange,
    submitMessage,
    status,
    error,
  };
}
