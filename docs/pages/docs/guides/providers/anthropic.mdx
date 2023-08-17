# Anthropic

import { Steps, Callout } from 'nextra-theme-docs'

Vercel AI SDK provides a set of utilities to make it easy to use Anthropic's API. In this guide, we'll walk through how to use the utilities to create a chat bot and a text completion app.

## Guide: Chat Bot

<Steps>

### Create a Next.js app

Create a Next.js application and install `ai`:

```sh
pnpm dlx create-next-app my-ai-app
cd my-ai-app
pnpm install ai
```

### Add your Anthropic API Key to `.env`

Create a `.env` file in your project root and add your Anthropic API Key:

```env filename=".env"
ANTHROPIC_API_KEY=xxxxxxx
```

### Create a Route Handler

Create a Next.js Route Handler that uses the Edge Runtime to generate a response to a series of messages via Anthropic's API, and returns the response as a streaming text response.

For this example, we'll create a route handler at `app/api/chat/route.ts` that accepts a `POST` request with a `messages` array of strings:

```tsx filename="app/api/chat/route.ts" showLineNumbers
import { AnthropicStream, StreamingTextResponse } from 'ai'

// IMPORTANT! Set the runtime to edge
export const runtime = 'edge'

// Build a prompt from the messages
function buildPrompt(
  messages: { content: string; role: 'system' | 'user' | 'assistant' }[]
) {
  return (
    messages
      .map(({ content, role }) => {
        if (role === 'user') {
          return `Human: ${content}`
        } else {
          return `Assistant: ${content}`
        }
      })
      .join('\n\n') + 'Assistant:'
  )
}

export async function POST(req: Request) {
  // Extract the `messages` from the body of the request
  const { messages } = await req.json()

  const response = await fetch('https://api.anthropic.com/v1/complete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY
    },
    body: JSON.stringify({
      prompt: buildPrompt(messages),
      model: 'claude-v1',
      max_tokens_to_sample: 300,
      temperature: 0.9,
      stream: true
    })
  })

  // Check for errors
  if (!response.ok) {
    return new Response(await response.text(), {
      status: response.status
    })
  }

  // Convert the response into a friendly text-stream
  const stream = AnthropicStream(response)

  // Respond with the stream
  return new StreamingTextResponse(stream)
}
```

<Callout>
  Vercel AI SDK provides 2 utility helpers to make the above seamless: First, we
  pass the streaming `response` we receive from Anthropic's API to
  [`AnthropicStream`](/docs/api-reference/anthropic-stream). This utility class
  decodes/extracts the text tokens in the response and then re-encodes them
  properly for simple consumption. We can then pass that new stream directly to
  [`StreamingTextResponse`](/docs/api-reference/streaming-text-response). This
  is another utility class that extends the normal Node/Edge Runtime `Response`
  class with the default headers you probably want (hint: `'Content-Type':
  'text/plain; charset=utf-8'` is already set for you).
</Callout>

### Wire up the UI

Create a Client component with a form that we'll use to gather the prompt from the user and then stream back the completion from.
By default, the [`useChat`](/docs/api-reference#usechat) hook will use the `POST` Route Handler we created above (it defaults to `/api/chat`). You can override this by passing a `api` prop to `useChat({ api: '...'})`.

```tsx filename="app/page.tsx" showLineNumbers
'use client'

import { useChat } from 'ai/react'

export default function Chat() {
  const { messages, input, handleInputChange, handleSubmit } = useChat()

  return (
    <div className="mx-auto w-full max-w-md py-24 flex flex-col stretch">
      {messages.map(m => (
        <div key={m.id}>
          {m.role === 'user' ? 'User: ' : 'AI: '}
          {m.content}
        </div>
      ))}

      <form onSubmit={handleSubmit}>
        <label>
          Say something...
          <input
            className="fixed w-full max-w-md bottom-0 border border-gray-300 rounded mb-8 shadow-xl p-2"
            value={input}
            onChange={handleInputChange}
          />
        </label>
        <button type="submit">Send</button>
      </form>
    </div>
  )
}
```

</Steps>

## Guide: Text Completion

<Steps>

### Use the Completion API

Similar to the Chat Bot example above, we'll create a Next.js Route Handler that generates a text completion via the same Anthropic API that we'll then stream back to our Next.js. It accepts a `POST` request with a `prompt` string:

```tsx filename="app/api/completion/route.ts" showLineNumbers
import { AnthropicStream, StreamingTextResponse } from 'ai'

// IMPORTANT! Set the runtime to edge
export const runtime = 'edge'

export async function POST(req: Request) {
  // Extract the `prompt` from the body of the request
  const { prompt } = await req.json()

  const response = await fetch('https://api.anthropic.com/v1/complete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY
    },
    body: JSON.stringify({
      prompt: `Human: ${prompt}\n\nAssistant:`,
      model: 'claude-v1',
      max_tokens_to_sample: 300,
      temperature: 0.9,
      stream: true
    })
  })

  // Convert the response into a friendly text-stream
  const stream = AnthropicStream(response)

  // Respond with the stream
  return new StreamingTextResponse(stream)
}
```

### Wire up the UI

We can use the [`useCompletion`](/docs/api-reference#usecompletion) hook to make it easy to wire up the UI. By default, the `useCompletion` hook will use the `POST` Route Handler we created above (it defaults to `/api/completion`). You can override this by passing a `api` prop to `useCompletion({ api: '...'})`.

```tsx filename="app/page.tsx" showLineNumbers
'use client'

import { useCompletion } from 'ai/react'

export default function Completion() {
  const {
    completion,
    input,
    stop,
    isLoading,
    handleInputChange,
    handleSubmit
  } = useCompletion({
    api: '/api/completion'
  })

  return (
    <div className="mx-auto w-full max-w-md py-24 flex flex-col stretch">
      <form onSubmit={handleSubmit}>
        <label>
          Say something...
          <input
            className="fixed w-full max-w-md bottom-0 border border-gray-300 rounded mb-8 shadow-xl p-2"
            value={input}
            onChange={handleInputChange}
          />
        </label>
        <output>Completion result: {completion}</output>
        <button type="button" onClick={stop}>
          Stop
        </button>
        <button disabled={isLoading} type="submit">
          Send
        </button>
      </form>
    </div>
  )
}
```

</Steps>

## Guide: Save to Database After Completion

It’s common to want to save the result of a completion to a database after streaming it back to the user. The `AnthropicStream` adapter accepts a couple of optional callbacks that can be used to do this.

```tsx filename="app/api/completion/route.ts" showLineNumbers
export async function POST(req: Request) {
  // ...

  // Convert the response into a friendly text-stream
  const stream = AnthropicStream(response, {
    onStart: async () => {
      // This callback is called when the stream starts
      // You can use this to save the prompt to your database
      await savePromptToDatabase(prompt)
    },
    onToken: async (token: string) => {
      // This callback is called for each token in the stream
      // You can use this to debug the stream or save the tokens to your database
      console.log(token)
    },
    onCompletion: async (completion: string) => {
      // This callback is called when the completion is ready
      // You can use this to save the final completion to your database
      await saveCompletionToDatabase(completion)
    }
  })

  // Respond with the stream
  return new StreamingTextResponse(response)
}
```
