import { nanoid } from 'ai';
import { Message } from 'ai/react';
import { useState } from 'react';

export function useAssistant() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [threadId, setThreadId] = useState<string | undefined>(undefined);

  const handleInputChange = (e: any) => {
    setInput(e.target.value);
  };

  const submitMessage = async (e: any) => {
    e.preventDefault();

    setMessages(messages => [
      ...messages,
      // TODO should have correct message id etc
      { id: nanoid(), role: 'user', content: input },
    ]);

    const result = await fetch('/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        threadId: threadId ?? null,
        message: input,
      }),
    });

    // TODO what about the messageId
    const { threadId: newThreadId, responseMessages } =
      (await result.json()) as {
        threadId: string;
        responseMessages: any[];
      };

    setThreadId(newThreadId);
    setMessages(messages => [
      ...messages,
      ...responseMessages.map((original: any) => ({
        id: original.id,
        role: original.role,
        content: original.content[0].text.value,
      })),
    ]);
  };

  return {
    messages,
    input,
    handleInputChange,
    submitMessage,
  };
}
