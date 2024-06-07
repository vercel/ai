'use client';

import { useState } from 'react';
import { ClientMessage } from './actions';
import { useActions } from 'ai/rsc';

export default function Home() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ClientMessage[]>([]);
  const { submitMessage } = useActions();

  const handleSubmission = async () => {
    setMessages(currentMessages => [
      ...currentMessages,
      {
        id: '123',
        status: 'user.message.created',
        text: input,
        gui: null,
      },
    ]);

    const response = await submitMessage(input);
    setMessages(currentMessages => [...currentMessages, response]);
    setInput('');
  };

  return (
    <div className="flex flex-col-reverse">
      <div className="flex flex-row gap-2 p-2 bg-zinc-100 w-full">
        <input
          className="bg-zinc-100 w-full p-2 outline-none"
          value={input}
          onChange={event => setInput(event.target.value)}
          placeholder="Ask a question"
          onKeyDown={event => {
            if (event.key === 'Enter') {
              handleSubmission();
            }
          }}
        />
        <button
          className="p-2 bg-zinc-900 text-zinc-100 rounded-md"
          onClick={handleSubmission}
        >
          Send
        </button>
      </div>

      <div className="flex flex-col h-[calc(100dvh-56px)] overflow-y-scroll">
        <div>
          {messages.map(message => (
            <div key={message.id} className="flex flex-col gap-1 border-b p-2">
              <div className="flex flex-row justify-between">
                <div className="text-sm text-zinc-500">{message.status}</div>
              </div>
              <div>{message.text}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
