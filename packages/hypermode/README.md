# AI SDK - Hypermode Provider

The **[Hypermode provider](https://sdk.vercel.ai/providers/ai-sdk-providers/hypermode)**
for the [Vercel AI SDK](https://sdk.vercel.ai/docs)
contains support for models available in the Hypermode Model Router.

## Setup

The Hypermode provider is available in the
`@ai-sdk/hypermode` module. You can install it with

```bash
npm i @ai-sdk/hypermode
```

## Provider Instance

You can import the default provider instance `hypermode` from `@ai-sdk/hypermode`:

```ts
import { hypermode } from '@ai-sdk/hypermode';
```

## Example

```ts
import { hypermode } from '@ai-sdk/hypermode';
import { generateText } from 'ai';

const { text } = await generateText({
  model: hypermode('meta-llama/llama-4-scout-17b-16e-instruct'),
  prompt: 'Write a vegetarian lasagna recipe for 4 people.',
});
```

## Documentation

Please check out the **[Hypermode provider](https://sdk.vercel.ai/providers/ai-sdk-providers/hypermode)**
for more information.
