import { nanoid } from 'nanoid';
import { useState } from 'react';
import { processMessageStream } from '../shared/process-message-stream';
import { AssistantStatus, JSONValue, Message } from '../shared/types';

export function experimental_useAssistant({ api }: { api: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [threadId, setThreadId] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<AssistantStatus | undefined>(undefined);

  // TODO data should be a list of the streamed data (and then use a custom reducer)
  // TODO figure out how to associate data with messages to show it inline in the conversation
  const [data, setData] = useState<JSONValue | undefined>(undefined);

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
          case '2': {
            setData(messageContent);
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
    data,
    acceptsMessage: status == undefined || status.status === 'complete',
  };
}
