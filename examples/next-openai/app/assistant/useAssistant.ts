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

        // Parse the JSON part
        const messageContent = JSON.parse(messageContentText);

        // Log or handle the parsed instruction number and data here
        console.log(
          `Instruction [${counter++}]: Number: ${messageType}, Data:`,
          messageContent,
        );

        switch (messageType) {
          case '3':
            setStatus(messageContent);
            break;
          case '4':
            setThreadId(messageContent);
            break;
        }
      } catch (error) {
        // Handle any parsing errors
        console.error(`Error parsing instruction [${counter++}]:`, error);
      }
    });

    console.log('DONE');

    // TODO what about the messageId
    // const { threadId: newThreadId, responseMessages } =
    //   (await result.json()) as {
    //     threadId: string;
    //     responseMessages: any[];
    //   };

    // setThreadId(newThreadId);
    // setMessages(messages => [
    //   ...messages,
    //   ...responseMessages.map((original: any) => ({
    //     id: original.id,
    //     role: original.role,
    //     content: original.content[0].text.value,
    //   })),
    // ]);
  };

  return {
    messages,
    input,
    handleInputChange,
    submitMessage,
    status,
  };
}
