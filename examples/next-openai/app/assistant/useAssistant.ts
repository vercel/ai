import { nanoid } from 'ai';
import { Message } from 'ai/react';
import { useState } from 'react';
import { processInstructionStream } from './processInstructionStream';
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
    await processInstructionStream(
      result.body.getReader(),
      (instruction: string) => {
        // Attempt to parse the instruction
        try {
          // Split the instruction at the first colon followed by a space to separate the number from the JSON
          const [numberPart, jsonPart] = instruction.split(/:\s/, 2);
          if (!jsonPart) {
            throw new Error('No JSON part found in the instruction.');
          }

          // Parse the JSON part
          const instructionData = JSON.parse(jsonPart);

          // Log or handle the parsed instruction number and data here
          console.log(
            `Instruction [${counter++}]: Number: ${numberPart}, Data:`,
            instructionData,
          );

          // status:
          if (numberPart === '3') {
            setStatus(instructionData);
          }
        } catch (error) {
          // Handle any parsing errors
          console.error(`Error parsing instruction [${counter++}]:`, error);
        }
      },
    );

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
