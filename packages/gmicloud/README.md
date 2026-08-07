# AI SDK - GMI Cloud Provider

The **GMI Cloud provider** for the [AI SDK](https://ai-sdk.dev/docs) contains language model support for [GMI Cloud](https://www.gmicloud.ai), offering GPU inference for open-weight models over an OpenAI-compatible API.

> **Deploying to Vercel?** With Vercel's AI Gateway you can access GMI Cloud (and hundreds of models from other providers) — no additional packages, API keys, or extra cost. [Get started with AI Gateway](https://vercel.com/ai-gateway).

## Setup

The GMI Cloud provider is available in the `@ai-sdk/gmicloud` module. You can install it with

```bash
npm i @ai-sdk/gmicloud
```

## Provider Instance

You can import the default provider instance `gmicloud` from `@ai-sdk/gmicloud`:

```ts
import { gmicloud } from '@ai-sdk/gmicloud';
```

The GMI Cloud API key is read from the `GMI_CLOUD_APIKEY` environment variable by default. For custom configuration, use `createGmicloud`:

```ts
import { createGmicloud } from '@ai-sdk/gmicloud';

const gmicloud = createGmicloud({
  apiKey: process.env.GMI_CLOUD_APIKEY ?? '',
});
```

## Language Models

```ts
import { gmicloud } from '@ai-sdk/gmicloud';
import { generateText } from 'ai';

const { text } = await generateText({
  model: gmicloud('deepseek-ai/DeepSeek-V4-Flash-0731'),
  prompt: 'What is the capital of France?',
});
```

GMI Cloud serves an evolving catalog of open-weight models over chat completions, so model ids are typed as `string`. Embedding and image models are not supported.

## Error diagnostics

GMI Cloud's edge reports a generic banner in `error.message` on rejections and nests the backend engine's diagnostic in `error.details`. This provider unwraps the nested diagnostic, so `AI_APICallError.message` carries the engine's reason (e.g. `The request is invalid: Invalid max_tokens value, the valid range of max_tokens is [1, 393216].`) instead of `Backend request failed with status 400`.
