# AI SDK - SambaNova Provider

The **[SambaNova provider](https://sdk.vercel.ai/providers/ai-sdk-providers/sambanova)** for the [AI SDK](https://sdk.vercel.ai/docs)
contains language model support for the SambaNova chat and completion APIs and embedding model support for the SambaNova embeddings API.

## Setup

The SambaNova provider is available in the `@ai-sdk/sambanova` module. You can install it with

```bash
npm i @ai-sdk/sambanova
```

## Provider Instance

You can import the default provider instance `sambanova` from `@ai-sdk/sambanova`:

```ts
import { sambanova } from '@ai-sdk/sambanova';
```

## Example

```ts
import { sambanova } from '@ai-sdk/sambanova';
import { generateText } from 'ai';

const { text } = await generateText({
  model: sambanova('gemma2-9b-it'),
  prompt: 'Write a vegetarian lasagna recipe for 4 people.',
});
```

## Documentation

Please check out the **[SambaNova provider documentation](https://sdk.vercel.ai/providers/ai-sdk-providers/sambanova)** for more information.
