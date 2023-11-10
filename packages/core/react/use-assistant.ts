import { nanoid } from 'nanoid';
import { useState } from 'react';
import { processMessageStream } from '../shared/process-message-stream';
import { AssistantStatus, Message } from '../shared/types';

export function useAssistant_experimental({ api }: { api: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [threadId, setThreadId] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<AssistantStatus | undefined>(undefined);

  const handleInputChange = (e: any) => {
    setInput(e.target.value);
  };

  const submitMessage = async (e: any) => {
    e.preventDefault();

    if (input === '') {
      return;
    }

    setMessages(messages => [
      ...messages,
      // TODO should have correct message id and timestamp
      { id: nanoid(), role: 'user', content: input },
    ]);

    setInput('');

    const result = await fetch(api, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        threadId: threadId ?? null,
        message: input,
      }),
    });

    if (result.body == null) {
      throw new Error('The response body is empty.');
    }

    await processMessageStream(result.body.getReader(), (message: string) => {
      try {
        const [messageType, ...rest] = message.split(/:(.+)/);
        const messageContentText = rest.join('');

        if (!messageContentText) {
          throw new Error('No content found in the message.');
        }

        const messageContent = JSON.parse(messageContentText);

        switch (messageType) {
          case '0': {
            setMessages(messages => [
              ...messages,
              {
                id: messageContent.id,
                role: messageContent.role,
                content: messageContent.content[0].text.value,
              },
            ]);

            break;
          }
          case '3': {
            setStatus(messageContent);
            break;
          }
          case '4': {
            setThreadId(messageContent);
            break;
          }
        }
      } catch (error) {
        // Handle any parsing errors
        console.error(`Error parsing instruction`, error);
      }
    });
  };

  return {
    messages,
    input,
    handleInputChange,
    submitMessage,
    status,
    acceptsMessage: status == undefined || status.status === 'complete',
  };
}
