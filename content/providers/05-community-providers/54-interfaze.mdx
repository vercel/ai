---
title: Interfaze
description: Interfaze Provider for the AI SDK
---

# Interfaze

[Interfaze](https://interfaze.ai) is an LLM built for developers and automations. The Interfaze provider brings it to the standard `generateText` and `streamText` APIs, including structured output through `Output`, and surfaces Interfaze's extras — the semantic-cache flag, reasoning, and internal-task `precontext` — on `providerMetadata`.

Learn more in the [Interfaze documentation](https://interfaze.ai/docs).

## Setup

The Interfaze provider is available in the `@interfaze-ai/ai-sdk` module. You can install it with:

<InstallPackages packages="@interfaze-ai/ai-sdk" />

## Provider Instance

Import the default `interfaze` instance, or build one with `createInterfaze`:

```ts
import { createInterfaze, interfaze } from '@interfaze-ai/ai-sdk';

const model = interfaze('interfaze-beta'); // reads INTERFAZE_API_KEY

const custom = createInterfaze({ apiKey: 'sk_...' });
```

You can obtain your API key from the [Interfaze dashboard](https://interfaze.ai).

## Language Models

Create a model with the provider instance and use it with `generateText` / `streamText`:

```ts
import { interfaze } from '@interfaze-ai/ai-sdk';
import { generateText } from 'ai';

const { text } = await generateText({
  model: interfaze('interfaze-beta'),
  prompt: 'Which US public companies reported earnings today?',
});
```

A web search backs the answer here — the sources land on `providerMetadata.interfaze.precontext` (see [Interfaze metadata](#interfaze-metadata)). `streamText` works the same way.

## Structured Output

Interfaze supports structured output with `generateText` and `streamText`. Use `Output.object` with a Zod schema to generate a typed object, including when extracting data from an image (OCR runs under the hood):

```ts
import { interfaze } from '@interfaze-ai/ai-sdk';
import { generateText, Output } from 'ai';
import { z } from 'zod';

const { output } = await generateText({
  model: interfaze('interfaze-beta'),
  output: Output.object({
    schema: z.object({
      merchant: z.string(),
      total: z.number(),
      items: z.array(z.object({ name: z.string(), price: z.number() })),
    }),
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

console.log(providerMetadata?.interfaze?.reasoning);
```

A semantic-cache hit replays a stored answer without reasoning; set `bypassCache: true` on the provider when you need fresh reasoning every call.

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

Images, audio, video, and documents all use standard AI SDK content parts. Pass a public URL — Interfaze fetches it server-side, so nothing is downloaded and re-encoded on the way out — or raw bytes:

| Kind      | Types                                                                                                                                               |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Image     | `image/jpeg` `image/png` `image/webp` `image/bmp` `image/heic` `image/heif`                                                                         |
| Audio     | `audio/wav` `audio/mpeg` `audio/mp4` `audio/ogg` `audio/flac`                                                                                       |
| Video     | `video/mp4` `video/quicktime` `video/webm` `video/3gpp` `video/x-msvideo` `video/x-matroska`                                                        |
| Documents | `application/pdf` `application/vnd.openxmlformats-officedocument.wordprocessingml.document` `application/json` `application/xml` `application/yaml` |
| Text      | `text/plain` `text/csv` `text/markdown` `text/tab-separated-values`                                                                                 |

`image/gif` and `image/avif` are rejected by the API.

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
{
  type: 'file',
  mediaType: 'video/mp4',
  data: new URL('https://…/clip.mp4'),
}
```

## Interfaze Metadata

Interfaze returns fields a plain chat provider drops. At runtime, they are available on `providerMetadata.interfaze` for both `generateText` and `streamText`:

```ts
const result = await generateText({
  model: interfaze('interfaze-beta'),
  prompt: 'What is the weather in San Francisco?',
});

const metadata = result.providerMetadata?.interfaze;

metadata?.vcache; // semantic-cache hit flag
metadata?.reasoning; // reasoning text
metadata?.precontext; // OCR / web / scrape / … output
```

Precontext is output-only — it reports the internal tools Interfaze ran while answering. With `streamText`, it is included in the final `providerMetadata` only when the provider is created with `showAdditionalInfo: true` (see [Client Options](#client-options)). Await `result.providerMetadata` after consuming the stream to access it.

## Client Options

Router, cache, and streaming behavior are set once on the provider:

```ts
const interfaze = createInterfaze({
  showAdditionalInfo: true, // include precontext in final stream metadata
  bypassMoA: true, // skip the mixture-of-agents router
  bypassCache: true, // skip the semantic cache
});
```

## Additional Resources

- [`@interfaze-ai/ai-sdk` on npm](https://www.npmjs.com/package/@interfaze-ai/ai-sdk)
- [`@interfaze-ai/ai-sdk` on GitHub](https://github.com/InterfazeAI/interfaze-ai-sdk)
- [Interfaze documentation](https://interfaze.ai/docs)
