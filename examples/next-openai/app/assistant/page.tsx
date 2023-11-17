'use client';

import { Message, experimental_useAssistant as useAssistant } from 'ai/react';
import { useEffect, useRef, useState } from 'react';

const roleToColorMap: Record<Message['role'], string> = {
  system: 'red',
  user: 'black',
  function: 'blue',
  assistant: 'green',
};

export default function Chat() {
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string>();

  const { status, messages, submitMessage, error } = useAssistant({
    api: '/api/assistant',
  });

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status === 'in_progress') return;

    setMessage('');
    setFile(null);

    await submitMessage(event);
  };

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      {error != null && (
        <div className="relative bg-red-500 text-white px-6 py-4 rounded-md">
          <span className="block sm:inline">
            Error: {(error as any).toString()}
          </span>
        </div>
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

      {status === 'in_progress' && (
        <div className="h-8 w-full max-w-md p-2 mb-8 bg-gray-300 dark:bg-gray-600 rounded-lg animate-pulse" />
      )}

      <form
        onSubmit={onSubmit}
        className="fixed flex bottom-0 w-full max-w-md p-2 mb-8 border border-gray-300 rounded shadow-xl"
      >
        <label htmlFor="file" className="hover:cursor-pointer">
          <span>📎</span>
          {file && (
            <span className="rounded-full w-2 h-2 bg-red-500  absolute top-2 left-6" />
          )}
          <input
            onChange={e => {
              if (e.target.files != null && e.target.files.length > 0) {
                setFile(e.target.files[0]);
              }
            }}
            type="file"
            id="file"
            name="file"
            className="sr-only"
          />
        </label>
        <input
          className="ml-4 w-full"
          placeholder="What is the temperature in the living room?"
          onChange={e => setMessage(e.target.value)}
          value={message}
          name="message"
        />
      </form>
    </div>
  );
}
