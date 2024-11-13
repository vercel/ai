# AI SDK - Grok Provider

The **[Grok provider](https://sdk.vercel.ai/providers/ai-sdk-providers/grok)** for the [AI SDK](https://sdk.vercel.ai/docs)
contains language model support for the Grok chat and completion APIs and embedding model support for the Grok embeddings API.

## Setup

The Grok provider is available in the `@ai-sdk/grok` module. You can install it with

```bash
npm i @ai-sdk/grok
```

## Provider Instance

You can import the default provider instance `grok` from `@ai-sdk/grok`:

```ts
import { grok } from '@ai-sdk/grok';
```

## Example

```ts
import { grok } from '@ai-sdk/grok';
import { generateText } from 'ai';

const { text } = await generateText({
  model: grok('grok-beta'),
  prompt: 'Write a vegetarian lasagna recipe for 4 people.',
});
```

## Documentation

Please check out the **[Grok provider documentation](https://sdk.vercel.ai/providers/ai-sdk-providers/grok)** for more information.
