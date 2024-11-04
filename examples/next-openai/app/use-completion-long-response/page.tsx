'use client';

import { useCompletion } from 'ai/react';
import ReactMarkdown from 'react-markdown';

export default function Chat() {
  const { completion, input, handleInputChange, handleSubmit, error, data } =
    useCompletion({ api: '/api/use-completion-long-response' });

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      <h4 className="pb-4 text-xl font-bold text-gray-900 md:text-xl">
        useCompletion Long Response Example
      </h4>
      {data && (
        <pre className="p-4 text-sm bg-gray-100">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
      {error && (
        <div className="fixed top-0 left-0 w-full p-4 text-center text-white bg-red-500">
          {error.message}
        </div>
      )}
      <ReactMarkdown
        components={{
          h1: ({ node, ...props }) => (
            <h1 className="text-2xl font-bold" {...props} />
          ),
          h2: ({ node, ...props }) => (
            <h2 className="text-xl font-bold" {...props} />
          ),
          h3: ({ node, ...props }) => (
            <h3 className="text-lg font-bold" {...props} />
          ),
        }}
      >
        {completion}
      </ReactMarkdown>
      <form onSubmit={handleSubmit}>
        <input
          className="fixed bottom-0 w-full max-w-md p-2 mb-8 border border-gray-300 rounded shadow-xl"
          value={input}
          placeholder="Book topic..."
          onChange={handleInputChange}
        />
      </form>
    </div>
  );
}
