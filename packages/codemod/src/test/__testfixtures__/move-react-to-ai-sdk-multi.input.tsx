// @ts-nocheck
import { useChat, useCompletion } from 'ai/react';
import { useState } from 'react';

export default function App() {
  const { messages } = useChat();
  const { completion } = useCompletion();
  const [count, setCount] = useState(0);

  return (
    <div>
      <p>Messages: {messages.length}</p>
      <p>Completion: {completion}</p>
      <p>Count: {count}</p>
    </div>
  );
} 