# Vercel AI Utils

Edge-ready utilities to accelerate working with AI in JavaScript and React.

## Installation

```sh
pnpm install @vercel/ai-utils
```

**Table of Contents**

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->

- [Installation](#installation)
- [Background](#background)
- [Usage](#usage)
- [Tutorial](#tutorial)
  - [Create a Next.js app](#create-a-nextjs-app)
  - [Add your OpenAI API Key to `.env`](#add-your-openai-api-key-to-env)
  - [Create a Route Handler](#create-a-route-handler)
  - [Wire up the UI](#wire-up-the-ui)
- [API Reference](#api-reference)
  - [`OpenAIStream(res: Response, cb: AIStreamCallbacks): ReadableStream`](#openaistreamres-response-cb-aistreamcallbacks-readablestream)
  - [`HuggingFaceStream(iter: AsyncGenerator<any>, cb?: AIStreamCallbacks): ReadableStream`](#huggingfacestreamiter-asyncgeneratorany-cb-aistreamcallbacks-readablestream)
  - [`StreamingTextResponse(res: ReadableStream, init?: ResponseInit)`](#streamingtextresponseres-readablestream-init-responseinit)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## Background

Creating UIs with contemporary AI providers is a daunting task. Ideally, language models/providers would be fast enough where developers could just fetch complete responses data with JSON in a few hundred milliseconds, but the reality is starkly different. It's quite common for these LLMs to take 5-40s to whip up a response.

Instead of tormenting users with a seemingly endless loading spinner while these models conjure up responses or completions, the progressive approach involves streaming the text output to the frontend on the fly-—a tactic championed by OpenAI's ChatGPT. However, implementing this technique is easier said than done. Each AI provider has its own unique SDK, each has its own envelope surrounding the tokens, and each with different metadata (whose usefulness varies drastically).

Many AI utility helpers so far in the JS ecosystem tend to overcomplicate things with unnecessary magic tricks, excess levels of indirection, and lossy abstractions. Here's where Vercel AI Utils comes to the rescue—**a compact library designed to alleviate the headaches of constructing streaming text UIs** by taking care of the most annoying parts and then getting out of your way:

- Diminish the boilerplate necessary for handling streaming text responses
- Guarantee the capability to run functions at the Edge
- Streamline fetching and rendering of streaming responses (in React)

The goal of this library lies in its commitment to work directly with each AI/Model Hosting Provider's SDK, an equivalent edge-compatible version, or a vanilla `fetch` function. Its job is simply to cut through the confusion and handle the intricacies of streaming text, leaving you to concentrate on building your next big thing instead of wasting another afternoon tweaking `TextEncoder` with trial and error.

## Usage

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
  const stream = OpenAITextStream(response);
  return new StreamingTextResponse(stream);
}
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
  // Convert the response into a friendly text-stream
  const stream = OpenAITextStream(response);
  // Respond with the stream
  return new StreamingTextResponse(stream);
}
```

Vercel AI Utils provides 2 utility helpers to make the above seamless: First, we pass the streaming `response` we receive from OpenAI to `OpenAITextStream`. This method decodes/extracts the text tokens in the response and then re-encodes them properly for simple consumption. We can then pass that new stream directly to `StreamingTextResponse`. This is another utility class that extends the normal Node/Edge Runtime `Response` class with the default headers you probably want (hint: `'Content-Type': 'text/plain; charset=utf-8'` is already set for you).

### Wire up the UI

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

### `OpenAIStream(res: Response, cb: AIStreamCallbacks): ReadableStream`

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
  const stream = OpenAITextStream(response, {
    async onStart() {
      console.log('streamin yo')
    },
    async onToken(token) {
      console.log('token: ' + token)
    },
    async onCompletion(content) {
      console.log('full text: ' + )
      // await prisma.messages.create({ content }) or something
    }
  });
  return new StreamingTextResponse(stream);
}
```

### `HuggingFaceStream(iter: AsyncGenerator<any>, cb?: AIStreamCallbacks): ReadableStream`

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
  const stream = HuggingFaceStream(response);
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
  const stream = OpenAITextStream(response);
  return new StreamingTextResponse(stream, {
    'X-RATE-LIMIT': 'lol',
  }); // => new Response(stream, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-RATE-LIMIT': 'lol' }})
}
```
