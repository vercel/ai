'use client';

import { useCompletion } from '@ai-sdk/react';

export default function Page() {
  const {
    completion,
    input,
    handleInputChange,
    handleSubmit,
    error,
    data,
    isLoading,
    stop,
  } = useCompletion();

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      <h4 className="pb-4 text-xl font-bold text-gray-900 md:text-xl">
        useCompletion Example
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
      {isLoading && (
        <div className="mt-4 text-gray-500">
          <div>Loading...</div>
          <button
            type="button"
            className="px-4 py-2 mt-4 text-blue-500 border border-blue-500 rounded-md"
            onClick={stop}
          >
            Stop
          </button>
        </div>
      )}
      {completion}
      <form onSubmit={handleSubmit}>
        <input
          className="fixed bottom-0 w-full max-w-md p-2 mb-8 border border-gray-300 rounded shadow-xl"
          value={input}
          placeholder="Say something..."
          onChange={handleInputChange}
          disabled={isLoading}
        />
      </form>
    </div>
  );
}
