'use client';

import { useChat } from 'ai/react';
import { FormEvent, useEffect, useState } from 'react';

export default function Chat() {
  const { data, handleSubmit, input, messages, setInput } = useChat({
    api: '/api/chat-with-data',
  });

  // populated by client, passed to server
  const [model, setModel] = useState('gpt-3.5-turbo');
  // populated by server, passed to client
  const [title, setTitle] = useState('');

  const handleForm = (e: FormEvent<HTMLFormElement>) =>
    // override handleSubmit() to send `model` to server
    handleSubmit(
      e,
      {},
      {
        body: {
          model,
        },
      },
    );

  useEffect(() => {
    // server hasn't sent any data yet
    if (!data) {
      setTitle('');
      return;
    }

    // data can be an array of anything so be sure to handle/type it based on your needs
    const newTitle = data.reduce(
      (result: string, current: any) => current.title || result,
      '',
    );

    setTitle(newTitle);
  }, [data]);

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      <div className="bg-black text-white fixed top-0 left-0 right-0 p-4 text-center font-bold">
        {title || '(Untitled Chat)'}
      </div>

      {messages.length > 0
        ? messages.map(m => (
            <div key={m.id} className="whitespace-pre-wrap">
              {m.role === 'user' ? 'User: ' : 'AI: '}
              {m.content}
            </div>
          ))
        : null}

      <form
        className="flex align-middle justify-center fixed bottom-8 left-6 right-6 gap-2"
        onSubmit={handleForm}
      >
        <input
          className="w-full max-w-md p-2 border border-gray-300 rounded"
          value={input}
          placeholder="Say something..."
          onChange={e => setInput(e.target.value)}
        />
        <select onChange={e => setModel(e.target.value)} value={model}>
          <option value="gpt-3.5-turbo">gpt-3.5-turbo</option>
          <option value="gpt-4">gpt-4</option>
        </select>
      </form>
    </div>
  );
}
