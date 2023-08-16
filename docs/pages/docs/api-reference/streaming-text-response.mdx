# StreamingTextResponse

## `StreamingTextResponse(res: ReadableStream, init?: ResponseInit): Response` [#streamingtextresponse]

`StreamingTextResponse` is a utility class that simplifies the process of returning a `ReadableStream` of text in HTTP responses. It is a lightweight wrapper around the native `Response` class, automatically setting the status code to `200` and the `Content-Type` header to `'text/plain; charset=utf-8'`.

## Parameters

### `res: ReadableStream`

This parameter should be a `ReadableStream` which represents the content of the HTTP response.

### `init?: ResponseInit`

This optional parameter can be used to customize the properties of the HTTP response. It is an object that corresponds to the `ResponseInit` object used in the `Response` constructor.

The `ResponseInit` object can contain the following properties:

- `status?: number`: The status code for the response. `StreamingTextResponse` will overwrite this value with `200`.
- `statusText?: string`: The status message associated with the status code.
- `headers?: HeadersInit`: Any headers you want to add to your response. `StreamingTextResponse` will add `'Content-Type': 'text/plain; charset=utf-8'` to these headers.

## Returns

`StreamingTextResponse` returns an instance of `Response` with the provided `ReadableStream` as the body, the status set to `200`, and the `Content-Type` header set to `'text/plain; charset=utf-8'`. Additional headers and properties can be added using the `init` parameter.

## Example

```tsx
// app/api/generate/route.ts
import { OpenAIStream, StreamingTextResponse } from 'ai'

export const runtime = 'edge'

export async function POST() {
  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    stream: true,
    messages: [{ role: 'user', content: 'What is love?' }]
  })
  const stream = OpenAIStream(response)
  return new StreamingTextResponse(stream, {
    headers: { 'X-RATE-LIMIT': 'lol' }
  })
  // Returns a Response with the stream as the body,
  // status code 200,
  // and headers 'Content-Type': 'text/plain; charset=utf-8' and 'X-RATE-LIMIT': 'lol'.
}
```

In this example, `StreamingTextResponse` is used to return a stream of text from the OpenAI chat completion endpoint as an HTTP response with additional custom headers.
