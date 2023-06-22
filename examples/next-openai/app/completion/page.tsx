'use client'

import { useCompletion } from 'ai/react'
import Link from 'next/link'

export default function Completion() {
  const {
    completion,
    input,
    stop,
    handleInputChange,
    handleSubmit
  } = useCompletion()

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      <form onSubmit={handleSubmit}>
        <div className="fixed bottom-0 flex w-full gap-2 mb-20">
          <input
            className="w-full max-w-md p-2 border border-gray-300 rounded shadow-xl"
            value={input}
            placeholder="Enter your prompt..."
            onChange={handleInputChange}
          />
          <button
            onClick={stop}
            className="bg-[#18181b] text-white py-2 px-4 rounded text-sm"
          >
            Stop
          </button>
        </div>
        <p>{completion}</p>
      </form>

      <Link
        href="/"
        className="absolute bg-[#18181b] text-white py-2 px-4 rounded text-sm bottom-0 mb-4 left-1/2 -translate-x-1/2"
      >
        Go to chat
      </Link>
    </div>
  )
}
