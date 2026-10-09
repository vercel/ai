# AI SDK - Nebul Provider

The **Nebul provider** for the [AI SDK](https://ai-sdk.dev/docs) contains language, embedding, image, transcription, speech, and reranking model support for the [Nebul Inference API](https://docs.nebul.io/docs/inference-api).

> **Deploying to Vercel?** With Vercel's AI Gateway you can access Nebul (and hundreds of models from other providers) without installing an additional provider package. [Get started with AI Gateway](https://vercel.com/ai-gateway).

## Setup

Install the Nebul provider with:

```bash
npm i @ai-sdk/nebul
```

## Provider Instance

Import the default provider instance from `@ai-sdk/nebul`:

```ts
import { nebul } from '@ai-sdk/nebul';
```

The provider reads the API key from `NEBUL_API_KEY` by default. To configure it explicitly, use `createNebul`:

```ts
import { createNebul } from '@ai-sdk/nebul';

const nebul = createNebul({
  apiKey: process.env.NEBUL_API_KEY,
});
```

## Model Catalog

To list the models that are currently available on the Nebul Inference API, use `getAvailableModels`:

```ts
import { nebul } from '@ai-sdk/nebul';

const models = await nebul.getAvailableModels();
```

Each entry includes the model `id`, its `modelType` (`'llm'`, `'embedding'`, `'audio'`, `'image'`, or `'reranker'`), capability flags, and `pricing` in USD per 1M tokens. The result is cached for 5 minutes.

## Language Models

```ts
import { nebul } from '@ai-sdk/nebul';
import { generateText } from 'ai';

const { text } = await generateText({
  model: nebul('zai-org/GLM-5.3-Flash'),
  prompt: 'Explain why the sky is blue.',
});

console.log(text);
```

Calling the provider without a model id defaults to `zai-org/GLM-5.3-Flash`.

The provider supports streaming, reasoning, function tools, structured output, and JSON object output on compatible models.

## Reranking Models

```ts
import { nebul } from '@ai-sdk/nebul';
import { rerank } from 'ai';

const { ranking } = await rerank({
  model: nebul.rerankingModel('BAAI/bge-reranker-v2-m3'),
  documents: ['sunny day at the beach', 'rainy day in the city'],
  query: 'talk about rain',
  topN: 2,
});

console.log(ranking);
```
