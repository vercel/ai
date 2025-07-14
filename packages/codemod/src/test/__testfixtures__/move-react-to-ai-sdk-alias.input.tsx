// @ts-nocheck
import { useChat as useAIChat } from 'ai/react';

export default function Chat() {
  const { messages } = useAIChat();
  return (
    <div>
      {messages.map((message) => (
        <div key={message.id}>{message.content}</div>
      ))}
    </div>
  );
} 