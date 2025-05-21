# AI SDK - Vercel Provider

The **[Vercel provider](https://ai-sdk.dev/providers/ai-sdk-providers/vercel)** for the [AI SDK](https://ai-sdk.dev/docs)
contains language model support for the Vercel API, giving you access to models like Llama 3, Mixtral, and other state-of-the-art LLMs.

## Setup

The Vercel provider is available in the `@ai-sdk/vercel` module. You can install it with

```bash
npm i @ai-sdk/vercel
```

## Provider Instance

You can import the default provider instance `vercel` from `@ai-sdk/vercel`:

```ts
import { vercel } from '@ai-sdk/vercel';
```

## Example

```ts
import { vercel } from '@ai-sdk/vercel';
import { generateText } from 'ai';

const { text } = await generateText({
  model: vercel('v0-1.0-md'),
  prompt: 'Create Next.js app',
});
```

## Documentation

Please check out the **[Vercel provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/vercel)** for more information.
