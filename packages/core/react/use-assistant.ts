/* eslint-disable react-hooks/rules-of-hooks */

import { useState } from 'react';
import { processMessageStream } from '../shared/process-message-stream';
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

export function experimental_useAssistant({
  api,
  threadId: threadIdParam,
}: {
  api: string;
  threadId?: string | undefined;
}): UseAssistantHelpers {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [threadId, setThreadId] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<AssistantStatus>('awaiting_message');
  const [error, setError] = useState<unknown | undefined>(undefined);

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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
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

    await processMessageStream(result.body.getReader(), (message: string) => {
      try {
        const { type, value } = parseStreamPart(message);

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

          case 'data_message': {
            setMessages(messages => [
              ...messages,
              {
                id: value.id ?? '',
                role: 'data',
                content: value.text ?? '',
                data: value.data,
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
      } catch (error) {
        setError(error);
      }
    });

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
