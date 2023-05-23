# Vercel AI Utils

Edge-ready utilities to accelerate working with AI in JavaScript and React.

## Installation

```sh
pnpm install @vercel/ai-utils
```

## Tutorial

For this example, we'll stream a chat completion text from OpenAI's `gpt-3.5-turbo` and render it in Next.js. This tutorial assumes you have

### Create a Next.js app

Create a Next.js application and install `@vercel/ai-utils` and `openai-edge`. We currently prefer the latter `openai-edge` library over the official OpenAI SDK because the official SDK uses `axios` which is not compatible with Vercel Edge Functions.

```sh
pnpx create-next-app my-ai-app
cd my-ai-app
pnpm install @vercel/ai-utils openai-edge
```

### Add your OpenAI API Key to `.env`

Create a `.env` file and add an OpenAI API Key called

```sh
touch .env
```

```env
OPENAI_API_KEY=xxxxxxxxx
```

### Create a Route Handler

Create a Next.js Route Handler that uses the Edge Runtime that we'll use to generate a chat completion via OpenAI that we'll then stream back to our Next.js.

```tsx
// ./app/api/generate/route.ts
import { Configuration, OpenAIApi } from 'openai-edge';
import { OpenAITextStream, StreamingTextResponse } from '@vercel/ai-utils';

// Create an OpenAI API client (that's edge friendly!)
const config = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(config);

// IMPORTANT! Set the runtime to edge
export const runtime = 'edge';

export async function POST(req: Request) {
  // Extract the `prompt` from the body of the request
  const { prompt } = await req.json();

  // Ask OpenAI for a streaming chat completion given the prompt
  const response = await openai.createCompletion({
    model: 'gpt-3.5-turbo',
    stream: true,
    prompt,
  });
  // Convert the response into a React-friendly text-stream
  const stream = new OpenAITextStream(response);
  // Respond with the stream
  return new StreamingTextResponse(stream);
}
```

Create a Client component with a form that we'll use to gather the prompt from the user and then stream back the completion from.

```tsx
// ./app/form.ts
'use client';

import { useState } from 'react';
import { useCompletion } from '@vercel/ai-utils/react'; //@todo

export function Form() {
  const [value, setValue] = useState('');
  const { setPrompt, completion } = useCompletion('/api/generate');
  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setPrompt(value);
          setValue('');
        }}
      >
        <textarea value={value} onChange={(e) => setValue(e.target.value)} />
        <button type="submit">Submit</button>
      </form>
      <div>{completion}</div>
    </div>
  );
}
```

## API Reference

### `OpenAIStream(res: Response): ReadableStream`

A transform that will extract the text from all chat and completion OpenAI models as returned as a `ReadableStream`.

```tsx
// app/api/generate/route.ts
import { Configuration, OpenAIApi } from 'openai-edge';
import { OpenAITextStream, StreamingTextResponse } from '@vercel/ai-utils';

const config = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(config);

export const runtime = 'edge';

export async function POST() {
  const response = await openai.createChatCompletion({
    model: 'gpt-4',
    stream: true,
    messages: [{ role: 'user', content: 'What is love?' }],
  });
  const stream = new OpenAITextStream(response);
  return new StreamingTextResponse(stream);
}
```

### `HuggingFaceStream(iter: AsyncGenerator<TextGenerationStreamOutput>): ReadableStream`

A transform that will extract the text from _most_ chat and completion HuggingFace models and return them as a `ReadableStream`.

```tsx
// app/api/generate/route.ts
import { HfInference } from '@huggingface/inference';
import { HuggingFaceStream, StreamingTextResponse } from '@vercel/ai-utils';

export const runtime = 'edge';

const Hf = new HfInference(process.env.HUGGINGFACE_API_KEY);

export async function POST() {
  const response = await Hf.textGenerationStream({
    model: 'OpenAssistant/oasst-sft-4-pythia-12b-epoch-3.5',
    inputs: `<|prompter|>What's the Earth total population?<|endoftext|><|assistant|>`,
    parameters: {
      max_new_tokens: 200,
      // @ts-ignore
      typical_p: 0.2, // you'll need this for OpenAssistant
      repetition_penalty: 1,
      truncate: 1000,
      return_full_text: false,
    },
  });
  const stream = new HuggingFaceStream(response);
  return new StreamingTextResponse(stream);
}
```

### `StreamingTextResponse(res: ReadableStream, init?: ResponseInit)`

This is a tiny wrapper around `Response` class that makes returning `ReadableStreams` of text a one liner. Status is automatically set to `200`, with `'Content-Type': 'text/plain; charset=utf-8'` set as `headers`.

```tsx
// app/api/generate/route.ts
import { OpenAITextStream, StreamingTextResponse } from '@vercel/ai-utils';

export const runtime = 'edge';

export async function POST() {
  const response = await openai.createChatCompletion({
    model: 'gpt-4',
    stream: true,
    messages: { role: 'user', content: 'What is love?' },
  });
  const stream = new OpenAITextStream(response);
  return new StreamingTextResponse(stream, {
    'X-RATE-LIMIT': 'lol',
  }); // => new Response(stream, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-RATE-LIMIT': 'lol' }})
}
```
