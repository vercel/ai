# OpenAIStream

## `OpenAIStream(res: Response, cb?: AIStreamCallbacks): ReadableStream` [#openaistream]

`OpenAIStream` is a utility function that transforms the response from OpenAI's completion and chat models into a `ReadableStream`. It uses `AIStream` under the hood, applying a specific parser for the OpenAI's response data structure.

This works with a variety of OpenAI models, including:

- `gpt-4`, `gpt-4-0314`, `gpt-4-32k`, `gpt-4-32k-0314`, `gpt-3.5-turbo`, `gpt-3.5-turbo-0301`
- `text-davinci-003`, `text-davinci-002`, `text-curie-001`, `text-babbage-001`, `text-ada-001`

It is designed to work with responses from either `openai.completions.create` or `openai.chat.completions.create` methods.

Note: Prior to v4, the official OpenAI API SDK does not support the Edge Runtime and only works in serverless environments. The `openai-edge` package is based on `fetch` instead of `axios` (and thus works in the Edge Runtime) so we recommend using `openai` v4+ or `openai-edge`.

## Parameters [#parameters]

### `res: Response`

This is the response object returned by either `openai.completions.create` or `openai.chat.completions.create` methods.

### `cb?: AIStreamCallbacks`

This is an optional parameter which is an object that contains callback functions for handling the start, completion, and each token of the AI response. If not provided, default behavior is applied.

## Examples [#examples]

Below are some examples of how to use `OpenAIStream` with chat and completion models.

### Chat Model Example

```tsx
import OpenAI from 'openai'
import { OpenAIStream, StreamingTextResponse } from 'ai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export const runtime = 'edge'

export async function POST(req: Request) {
  const { messages } = await req.json()
  // Create a chat completion using OpenAI
  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    stream: true,
    messages
  })

  // Transform the response into a readable stream
  const stream = OpenAIStream(response)

  // Return a StreamingTextResponse, which can be consumed by the client
  return new StreamingTextResponse(stream)
}
```

### Completion Model Example

```tsx
import OpenAI from 'openai'
import { OpenAIStream, StreamingTextResponse } from 'ai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export const runtime = 'edge'

export async function POST(req: Request) {
  const { prompt } = await req.json()
  // Create a completion using OpenAI
  const response = await openai.completions.create({
    model: 'text-davinci-003',
    stream: true,
    prompt
  })

  // Transform the response into a readable stream
  const stream = OpenAIStream(response)

  // Return a StreamingTextResponse, which can be consumed by the client
  return new StreamingTextResponse(stream)
}
```

In these examples, the `OpenAIStream` function is used to transform the response from OpenAI API calls into a `ReadableStream`, allowing the client to consume the AI output as it is generated, rather than waiting for the entire response.
