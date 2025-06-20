// @ts-nocheck
import { useChat } from '@ai-sdk/react';

export default function App() {
  const { messages } = useChat();
  return (
    <div>
      {messages.map((message) => (
        <div key={message.id}>{message.content}</div>
      ))}
    </div>
  );
} 