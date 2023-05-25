'use client'

import { OpenAIStream, useChat } from '@vercel/ai-utils'
import { nanoid } from 'nanoid'
import { useState } from 'react'
export function Chat() {
  const { messages, append } = useChat({
    initialMessages: [],
    api: '/api/generate',
    StreamProvider: OpenAIStream
  })
  const [input, setInput] = useState('')
  return (
    <div className="mx-auto w-full max-w-md py-24">
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
          className="border rounded w-full"
          value={input}
          onChange={e => setInput(e.target.value)}
        />
      </form>
    </div>
  )
}
