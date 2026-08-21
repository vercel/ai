# AI SDK - Parasail Provider

The **[Parasail provider](https://ai-sdk.dev/providers/ai-sdk-providers/parasail)** for the [AI SDK](https://ai-sdk.dev/docs)
contains language model support for [Parasail](https://www.parasail.io)'s serverless inference platform, which serves popular open-weight models over an OpenAI-compatible API.

## Setup

The Parasail provider is available in the `@ai-sdk/parasail` module. You can install it with

```bash
npm i @ai-sdk/parasail
```

## Provider Instance

You can import the default provider instance `parasail` from `@ai-sdk/parasail`:

```ts
import { parasail } from '@ai-sdk/parasail';
```

## Basic Text Generation

```ts
import { parasail } from '@ai-sdk/parasail';
import { generateText } from 'ai';

const { text } = await generateText({
  model: parasail('parasail-deepseek-r1'),
  prompt: 'What is the capital of France?',
});
```

## Available Models

Parasail serves an evolving catalog of serverless models prefixed with `parasail-`, and also supports dedicated deployments and, on batch/dedicated tiers, arbitrary Hugging Face model IDs. List the currently available models with:

```bash
curl https://api.parasail.io/v1/models \
  -H "Authorization: Bearer $PARASAIL_API_KEY"
```

## Documentation

Please check out the **[Parasail provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/parasail)** for more information.
