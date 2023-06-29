# Vercel AI SDK

The Vercel AI SDK is **a library for building edge-ready AI-powered streaming text and chat UIs**.

## Features

- [SWR](https://swr.vercel.app)-powered React, Svelte and Vue helpers for streaming text responses and building chat and completion UIs
- First-class support for [LangChain](js.langchain.com/docs) and [OpenAI](https://openai.com), [Anthropic](https://www.anthropic.com), and [Hugging Face](https://huggingface.co)
- Node.js, Serverless, and [Edge Runtime](https://edge-runtime.vercel.app/) support
- Callbacks for saving completed streaming responses to a database (in the same request)

## Installation

```sh
pnpm install ai
```

View the full documentation and examples on [sdk.vercel.ai/docs](https://sdk.vercel.ai/docs)

## Example: An AI Chatbot with Next.js and OpenAI

With the Vercel AI SDK, you can build a ChatGPT-like app in just a few lines of code:

```tsx
// ./app/api/chat/route.js
import { Configuration, OpenAIApi } from 'openai-edge'
import { OpenAIStream, StreamingTextResponse } from 'ai'

const config = new Configuration({
  apiKey: process.env.OPENAI_API_KEY
})
const openai = new OpenAIApi(config)

export const runtime = 'edge'

export async function POST(req) {
  const { messages } = await req.json()
  const response = await openai.createChatCompletion({
    model: 'gpt-4',
    stream: true,
    messages
  })
  const stream = OpenAIStream(response)
  return new StreamingTextResponse(stream)
}
```

```tsx
// ./app/page.js
'use client'

import { useChat } from 'ai/react'

export default function Chat() {
  const { messages, input, handleInputChange, handleSubmit } = useChat()

  return (
    <div>
      {messages.map(m => (
        <div key={m.id}>
          {m.role}: {m.content}
        </div>
      ))}

      <form onSubmit={handleSubmit}>
        <input
          value={input}
          placeholder="Say something..."
          onChange={handleInputChange}
        />
      </form>
    </div>
  )
}
```

---

View the full documentation and examples on [sdk.vercel.ai/docs](https://sdk.vercel.ai/docs)

## Authors

This library is created by [Vercel](https://vercel.com) and [Next.js](https://nextjs.org) team members, with contributions from:

- Jared Palmer ([@jaredpalmer](https://twitter.com/jaredpalmer)) - [Vercel](https://vercel.com)
- Shu Ding ([@shuding\_](https://twitter.com/shuding_)) - [Vercel](https://vercel.com)
- Max Leiter ([@max_leiter](https://twitter.com/max_leiter)) - [Vercel](https://vercel.com)
- Malte Ubl ([@cramforce](https://twitter.com/cramforce)) - [Vercel](https://vercel.com)
- Justin Ridgewell ([@jridgewell](https://github.com/jridgewell)) - [Vercel](https://vercel.com)

[Contributors](https://github.com/vercel-labs/ai/graphs/contributors)
