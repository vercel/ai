# AI SDK - Interfaze Provider

The **Interfaze provider** for the [AI SDK](https://ai-sdk.dev/docs) brings [Interfaze](https://interfaze.ai) to the standard `generateText` / `streamText` / `generateObject` surface, and surfaces Interfaze's extras — the semantic-cache flag, reasoning, and internal-task `precontext` — on `providerMetadata`.

## Setup

```bash
npm i @ai-sdk/interfaze
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Provider Instance

Import the default `interfaze` instance, or build one with `createInterfaze`:

```ts
import { createInterfaze, interfaze } from '@ai-sdk/interfaze';

interfaze('interfaze-beta'); // default, reads INTERFAZE_API_KEY

const custom = createInterfaze({ apiKey: 'sk_...' });
```

## Text

```ts
import { interfaze } from '@ai-sdk/interfaze';
import { generateText } from 'ai';

const { text } = await generateText({
  model: interfaze('interfaze-beta'),
  prompt: 'Which US public companies reported earnings today?',
});
```

`streamText` works the same way. A web search backs the answer here — the sources land on `providerMetadata.interfaze.precontext` (see [Interfaze metadata](#interfaze-metadata)).

## Structured output

Interfaze supports structured outputs, so `generateObject` / `streamObject` work with a Zod schema — including extraction from an image (OCR runs under the hood):

```ts
import { interfaze } from '@ai-sdk/interfaze';
import { generateObject } from 'ai';
import { z } from 'zod';

const { object } = await generateObject({
  model: interfaze('interfaze-beta'),
  schema: z.object({
    merchant: z.string(),
    total: z.number(),
    items: z.array(z.object({ name: z.string(), price: z.number() })),
  }),
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Extract this receipt.' },
        {
          type: 'image',
          image: new URL('https://jigsawstack.com/preview/vocr-example.jpg'),
        },
      ],
    },
  ],
});
```

## Reasoning

Set `reasoningEffort` (`'minimal' | 'low' | 'medium' | 'high'`, plus Interfaze's `'on' | 'off' | 'auto'`); the reasoning text comes back on `providerMetadata.interfaze.reasoning`:

```ts
const { text, providerMetadata } = await generateText({
  model: interfaze('interfaze-beta'),
  prompt: 'Which region should we launch in first, and why?',
  providerOptions: { interfaze: { reasoningEffort: 'high' } },
});

providerMetadata?.interfaze?.reasoning; // string | undefined
```

## Guardrails

Enable safety categories with `guard`; a blocked request comes back as a normal completion whose text is the plain string `unsafe <code>` (not an error):

```ts
const { text } = await generateText({
  model: interfaze('interfaze-beta'),
  prompt: '...',
  providerOptions: { interfaze: { guard: ['S1', 'S10', 'S12_IMAGE'] } },
});
```

## Multimodal

Images, PDFs, and video use standard AI SDK content parts. Pass a public URL — Interfaze fetches it server-side — or raw bytes:

```ts
await generateText({
  model: interfaze('interfaze-beta'),
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Summarize this document.' },
        {
          type: 'file',
          mediaType: 'application/pdf',
          data: new URL('https://arxiv.org/pdf/1706.03762'),
        },
      ],
    },
  ],
});
```

Video is a `file` part with a `video/*` media type; Interfaze reads the URL server-side:

```ts
{ type: 'file', mediaType: 'video/mp4', data: new URL('https://…/clip.mp4') }
```

## Interfaze metadata

Interfaze returns fields a plain chat provider drops. They land on `providerMetadata.interfaze` for both `generateText` and `streamText`:

```ts
const result = await generateText({
  model: interfaze('interfaze-beta'),
  prompt: 'What is the weather in San Francisco?',
});

result.providerMetadata?.interfaze?.vcache; // boolean — semantic-cache hit
result.providerMetadata?.interfaze?.reasoning; // string | undefined
result.providerMetadata?.interfaze?.precontext; // unknown[] | undefined — OCR / web / scrape / … output
```

You can also feed precomputed tool output to skip Interfaze's internal tool run:

```ts
await generateText({
  model: interfaze('interfaze-beta'),
  prompt: 'Extract the total from the receipt.',
  providerOptions: {
    interfaze: {
      precontext: [{ name: 'ocr', result: { extracted_text: '...' } }],
    },
  },
});
```

## Client options

Router, cache, and streaming behavior are set once on the provider:

```ts
const interfaze = createInterfaze({
  showAdditionalInfo: true, // stream <precontext> deltas as they're produced
  bypassMoe: true, // skip the mixture-of-experts router
  bypassCache: true, // skip the semantic cache
});
```

## Documentation

Please see the [Interfaze provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/interfaze) for more information.
