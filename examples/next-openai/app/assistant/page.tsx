'use client';

import { Message } from 'ai/react';
import { experimental_useAssistant } from './useAssistant';
import { useEffect, useRef } from 'react';

const roleToColorMap: Record<Message['role'], string> = {
  system: 'red',
  user: 'black',
  function: 'blue',
  assistant: 'green',
};

export default function Chat() {
  const {
    status,
    messages,
    input,
    submitMessage,
    handleInputChange,
    data,
    acceptsMessage,
  } = experimental_useAssistant({
    api: '/api/assistant',
  });

  const inputRef = useRef<HTMLInputElement>(null); // Create a ref for the input element

  useEffect(() => {
    // When acceptsMessage changes and is true, focus the input
    if (acceptsMessage) {
      inputRef.current?.focus();
    }
  }, [acceptsMessage]);

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      {data && (
        <pre>
          <code>{JSON.stringify(data, null, 2)}</code>
        </pre>
      )}

      {messages.map((m: Message) => (
        <div
          key={m.id}
          className="whitespace-pre-wrap"
          style={{ color: roleToColorMap[m.role] }}
        >
          <strong>{`${m.role}: `}</strong>
          {m.content}
          <br />
          <br />
        </div>
      ))}

      {status?.status === 'in_progress' && (
        <div className="h-8 w-full max-w-md p-2 mb-8 bg-gray-300 dark:bg-gray-600 rounded-lg animate-pulse" />
      )}

      <form onSubmit={submitMessage}>
        <input
          ref={inputRef}
          disabled={!acceptsMessage}
          className="fixed bottom-0 w-full max-w-md p-2 mb-8 border border-gray-300 rounded shadow-xl"
          value={input}
          placeholder="What is the temperature in the living room?"
          onChange={handleInputChange}
        />
      </form>
    </div>
  );
}
