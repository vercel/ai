import { nanoid } from 'ai';
import { Message } from 'ai/react';
import { useState } from 'react';
import { processMessageStream } from './processMessageStream';
import { AssistantStatus } from '../api/assistant/AssistantResponse';

export function useAssistant() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [threadId, setThreadId] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<AssistantStatus | undefined>(undefined);

  const handleInputChange = (e: any) => {
    setInput(e.target.value);
  };

  // TODO support adding custom data
  const submitMessage = async (e: any) => {
    e.preventDefault();

    if (input === '') {
      return;
    }

    setMessages(messages => [
      ...messages,
      // TODO should have correct message id etc
      { id: nanoid(), role: 'user', content: input },
    ]);

    setInput('');

    const result = await fetch('/api/assistant', {
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

    let counter = 0;
    await processMessageStream(result.body.getReader(), (message: string) => {
      try {
        const [messageType, messageContentText] = message.split(/:\s/, 2);

        if (!messageContentText) {
          throw new Error('No content found in the message.');
        }

        const messageContent = JSON.parse(messageContentText);

        switch (messageType) {
          case '0': {
            // TODO support streaming message updates
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
        console.error(`Error parsing instruction [${counter++}]:`, error);
      }
    });
  };

  return {
    messages,
    input,
    handleInputChange,
    submitMessage,
    status,
  };
}
