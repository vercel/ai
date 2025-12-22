# AI SDK - Voyage AI Provider

The **[Voyage AI provider](https://ai-sdk.dev/providers/ai-sdk-providers/voyage)** for the [AI SDK](https://ai-sdk.dev/docs) contains embedding and reranking model support for the Voyage AI APIs.

## Setup

The Voyage AI provider is available in the `@ai-sdk/voyage` module. You can install it with

```bash
npm i @ai-sdk/voyage
```

## Provider Instance

You can import the default provider instance `voyage` from `@ai-sdk/voyage`:

```ts
import { voyage } from '@ai-sdk/voyage';
```

## Example

```ts
import { voyage } from '@ai-sdk/voyage';
import { embed, rerank } from 'ai';

// Embeddings
const { embedding } = await embed({
  model: voyage.embedding('voyage-3.5'),
  value: 'sunny day at the beach',
});

// Reranking
const { ranking } = await rerank({
  model: voyage.reranking('rerank-2.5'),
  documents: ['sunny day at the beach', 'rainy afternoon in the city'],
  query: 'talk about rain',
  topN: 2,
});
```
