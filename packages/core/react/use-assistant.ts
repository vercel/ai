/* eslint-disable react-hooks/rules-of-hooks */

import { useState } from 'react';
import { processMessageStream } from '../shared/process-message-stream';
import { Message } from '../shared/types';
import { parseStreamPart } from '../shared/stream-parts';

export type AssistantStatus = 'in_progress' | 'awaiting_message';

export function experimental_useAssistant({
  api,
  threadId: threadIdParam,
}: {
  api: string;
  threadId?: string | undefined;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [threadId, setThreadId] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<AssistantStatus>('awaiting_message');
  const [error, setError] = useState<unknown | undefined>(undefined);

  // from form submit:
  const submitMessage = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const formData = new FormData(e.currentTarget);
    formData.append('threadId', threadIdParam || threadId || '');

    const content = formData.get('message') as string;

    setStatus('in_progress');

    setMessages(messages => [...messages, { id: '', role: 'user', content }]);

    const result = await fetch(api, {
      method: 'POST',
      body: formData,
    });

    if (result.body == null) {
      throw new Error('The response body is empty.');
    }

    await processMessageStream(result.body.getReader(), (message: string) => {
      try {
        const { type, value } = parseStreamPart(message);

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
      } catch (error) {
        setError(error);
      }
    });

    setStatus('awaiting_message');
  };

  return {
    messages,
    submitMessage,
    status,
    error,
  };
}
