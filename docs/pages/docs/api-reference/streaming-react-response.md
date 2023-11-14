---
title: experimental_StreamingReactResponse
layout:
  toc: false
---

# `experimental_StreamingReactResponse`

The `experimental_StreamingReactResponse` class allows you to stream React component responses.

<Callout>
  The `experimental_` prefix indicates that the API is not yet stable and may
  change in the future without a major version bump.

It is currently only implemented from `ai/react`'s `useChat` hook.

</Callout>

## `experimental_StreamingReactResponse(res: ReadableStream, options?: ResponseOptions): Response` [#streamingreactresponse]

The `experimental_StreamingReactResponse` class is designed to facilitate streaming React responses in a server action environment. It can handle and stream both raw content and data payloads, including special UI payloads, through nested promises.

## Parameters

### `res: ReadableStream`

This parameter should be a `ReadableStream`, which encapsulates the HTTP response's content. It represents the stream from which the response is read and processed.

### `options?: {ui?: Function, data?: experimental_StreamData}`

This optional parameter allows additional configurations for rendering React components and handling streamed data.

The options object can include:

- `ui?: (message: {content: string, data?: JSONValue[] | undefined}) => UINode | Promise<UINode>`: A function that receives a message object with `content` and optional `data` fields. This function should return a React component (as `UINode`) for each chunk in the stream. The `data` attribute in the message is available when the `data` option is configured to include stream data.
- `data?: experimental_StreamData`: An instance of `experimental_StreamData` used to process and stream data along with the response.

## Returns

The method returns a `Promise<ReactResponseRow>`, which resolves to the next row of the React response. Each row contains a payload with UI components (`ui`), raw content (`content`), and a `next` property pointing to the subsequent row or `null` if it's the last row. This setup allows for continuous streaming and rendering of data in a React-based UI.

## Example

### Server-Side Implementation

This example demonstrates how to use `experimental_StreamingReactResponse` within a server context, particularly within a Next.js environment. The server-side script includes the handler function, which uses the OpenAI API to process and stream chat completions. The response is streamed using `OpenAIStream` and is then passed to `experimental_StreamingReactResponse` for rendering.

Server:

```tsx
// app/stream-react-response/action.tsx
'use server';

import OpenAI from 'openai';
import { OpenAIStream, experimental_StreamingReactResponse, Message } from 'ai';
import { Counter } from './counter';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function handler({ messages }: { messages: Message[] }) {
  // Request the OpenAI API for the response based on the prompt
  const response = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    stream: true,
    messages: messages.map(m => ({
      role: m.role,
      content: m.content,
    })),
  });

  // Convert the response into a friendly text-stream
  const stream = OpenAIStream(response);

  // Respond with the stream
  return new experimental_StreamingReactResponse(stream, {
    ui({ content }) {
      return (
        <div className="italic text-red-800">
          Visit Next.js docs at{' '}
          <a
            href="https://nextjs.org/docs"
            target="_blank"
            className="underline"
          >
            https://nextjs.org/docs
          </a>
        </div>
      );
    },
  });
}
```

### Client-Side Setup

On the client side, the useChat hook from ai/react is utilized to manage the chat interaction. The `Chat` component below renders the chat interface, including input forms and message displays. It dynamically integrates the server-side stream, displaying messages and UI elements as they are received.

```tsx
// app/stream-react-response/page.tsx

import { handler } from './action';
import { Chat } from './chat';

export const runtime = 'edge';

export default function Page() {
  return <Chat handler={handler} />;
}
```

```tsx
// app/stream-react-response/chat.tsx

'use client';

import { useChat } from 'ai/react';

export function Chat({ handler }: { handler: any }) {
  const { messages, input, handleInputChange, handleSubmit } = useChat({
    api: handler,
  });

  return (
    <div className="container mx-auto p-4">
      <ul>
        {messages.map((m, index) => (
          <li key={index}>
            {m.role === 'user' ? 'User: ' : 'AI: '}
            {m.role === 'user' ? m.content : m.ui}
          </li>
        ))}
      </ul>

      <form
        className="flex gap-2 fixed bottom-0 left-0 w-full p-4 border-t"
        onSubmit={handleSubmit}
      >
        <input
          className="border border-gray-500 rounded p-2 w-full"
          placeholder="what is Next.js..."
          value={input}
          onChange={handleInputChange}
          autoFocus
        />
        <button type="submit" className="bg-black text-white rounded px-4">
          Send
        </button>
      </form>
    </div>
  );
}
```
