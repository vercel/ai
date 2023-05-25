'use client'

import { useChat } from '@vercel/ai-utils'
import { nanoid } from 'nanoid'
import { useState } from 'react'
export function Chat() {
  const { messages, append } = useChat({
    initialMessages: [],
    api: '/api/generate'
  })
  const [input, setInput] = useState('')
  return (
    <div className="mx-auto w-full max-w-md py-24 flex flex-col stretch">
      {messages && messages.length
        ? messages.map(m => <div key={m.id}>{m.content}</div>)
        : null}

      <form
        onSubmit={e => {
          e.preventDefault()
          append({
            id: nanoid(12),
            content: input,
            role: 'user'
          })
          setInput('')
        }}
      >
        <input
          className="fixed w-full max-w-md bottom-0 border border-gray-300 rounded mb-8 shadow-xl p-2"
          value={input}
          placeholder="Say something..."
          onChange={e => setInput(e.target.value)}
        />
      </form>
    </div>
  )
}
