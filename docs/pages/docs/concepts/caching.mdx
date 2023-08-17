---
title: Caching Responses
---

# Caching Responses

Depending on the type of application you're building, you may want to cache the responses you receive from your AI provider, at least temporarily.

Each stream helper for each provider has special lifecycle callbacks you can use. The one of interest is likely `onCompletion`, which is called when the stream is closed. This is where you can cache the full response.

## Example: Vercel KV

This example uses [Vercel KV](https://vercel.com/storage/kv) and Next.js to cache the OpenAI response for 1 hour.

```tsx filename="app/api/chat/route.ts"
import OpenAI from 'openai'
import { OpenAIStream, StreamingTextResponse } from 'ai'
import kv from '@vercel/kv'

export const runtime = 'edge'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
})

export async function POST(req: Request) {
  const { messages } = await req.json()
  const key = JSON.stringify(messages) // come up with a key based on the request

  // Check if we have a cached response
  const cached = await kv.get(key)
  if (cached) {
    return new Response(cached)

    // Optional: Emulate streaming by breaking the cached response into chunks

    // const chunks = cached.split(' ');
    // const stream = new ReadableStream({
    //   async start(controller) {
    //     for (const chunk of chunks) {
    //       const bytes = new TextEncoder().encode(chunk + ' ');
    //       controller.enqueue(bytes);
    //       await new Promise((r) =>
    //         setTimeout(
    //           r,
    //           // get a random number between 10ms and 50ms to simulate a random delay
    //           Math.floor(Math.random() * 40) + 10
    //         )
    //       );
    //     }
    //     controller.close();
    //   },
    // });
    // return new StreamingTextResponse(stream);
  }

  const response = await openai.chat.completions.create({
    // ... omitted for brevity
  })

  // Convert the response into a friendly text-stream
  const stream = OpenAIStream(response, {
    async onFinal(completion) {
      // Cache the response. Note that this will also cache function calls.
      await kv.set(key, completion)
      await kv.expire(key, 60 * 60)
    }
  })

  return new StreamingTextResponse(stream)
}
```
