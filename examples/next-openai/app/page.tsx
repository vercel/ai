'use client'

import { useChat } from 'ai/react'
import Link from 'next/link'

export default function Chat() {
  const { messages, input, handleInputChange, handleSubmit } = useChat()

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      {messages.length > 0
        ? messages.map(m => (
            <div key={m.id} className="whitespace-pre-wrap">
              {m.role === 'user' ? 'User: ' : 'AI: '}
              {m.content}
            </div>
          ))
        : null}

      <form onSubmit={handleSubmit}>
        <input
          className="fixed bottom-0 w-full max-w-md p-2 mb-20 border border-gray-300 rounded shadow-xl"
          value={input}
          placeholder="Say something..."
          onChange={handleInputChange}
        />
      </form>

      <Link
        href="/completion"
        className="fixed bg-[#18181b] text-white py-2 px-4 rounded text-sm bottom-0 mb-4 left-1/2 -translate-x-1/2"
      >
        Go to completion
      </Link>
    </div>
  )
}
