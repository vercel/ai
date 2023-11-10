'use client';

import { Message } from 'ai/react';
import { experimental_useAssistant } from './useAssistant';

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

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      <pre>
        <code>{JSON.stringify(status, null, 2)}</code>
      </pre>

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

      <form onSubmit={submitMessage}>
        <input
          disabled={!acceptsMessage}
          className="fixed bottom-0 w-full max-w-md p-2 mb-8 border border-gray-300 rounded shadow-xl"
          value={input}
          placeholder="Say something..."
          onChange={handleInputChange}
        />
      </form>
    </div>
  );
}
