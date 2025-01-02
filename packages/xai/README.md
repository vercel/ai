# AI SDK - xAI Grok Provider

The **[xAI Grok provider](https://sdk.vercel.ai/providers/ai-sdk-providers/xai)** for the [AI SDK](https://sdk.vercel.ai/docs)
contains language model support for the xAI chat and completion APIs.

## Setup

The xAI Grok provider is available in the `@ai-sdk/xai` module. You can install it with

```bash
npm i @ai-sdk/xai
```

## Provider Instance

You can import the default provider instance `xai` from `@ai-sdk/xai`:

```ts
import { xai } from '@ai-sdk/xai';
```

## Example

```ts
import { xai } from '@ai-sdk/xai';
import { generateText } from 'ai';

const { text } = await generateText({
  model: xai('grok-2-1212'),
  prompt: 'Write a vegetarian lasagna recipe for 4 people.',
});
```

## Documentation

Please check out the **[xAI Grok provider documentation](https://sdk.vercel.ai/providers/ai-sdk-providers/xai)** for more information.
