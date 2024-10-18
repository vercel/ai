'use client';

import { Message, useChat } from 'ai/react';

export default function Chat() {
  const { messages, input, handleInputChange, handleSubmit, data, setData } =
    useChat({ api: '/api/use-chat-streamdata' });

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      {data && (
        <>
          <pre className="p-4 text-sm bg-gray-100">
            {JSON.stringify(data, null, 2)}
          </pre>
          <button
            onClick={() => setData(undefined)}
            className="px-4 py-2 mt-2 text-white bg-blue-500 rounded hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
          >
            Clear Data
          </button>
        </>
      )}

      {messages?.map((m: Message) => (
        <div key={m.id} className="whitespace-pre-wrap">
          <strong>{`${m.role}: `}</strong>
          {m.content}
          {m.annotations && (
            <pre className="p-4 text-sm bg-gray-100">
              {JSON.stringify(m.annotations, null, 2)}
            </pre>
          )}
          <br />
          <br />
        </div>
      ))}

      <form
        onSubmit={e => {
          setData(undefined); // clear stream data
          handleSubmit(e);
        }}
      >
        <input
          className="fixed bottom-0 w-full max-w-md p-2 mb-8 border border-gray-300 rounded shadow-xl"
          value={input}
          placeholder="Say something..."
          onChange={handleInputChange}
        />
      </form>
    </div>
  );
}
