# AI SDK - Z.AI Provider

The **Z.AI provider** for the [AI SDK](https://ai-sdk.dev/docs) contains language model support for [Z.AI](https://z.ai/) GLM models.

> **Deploying to Vercel?** With Vercel's AI Gateway you can access Z.AI (and hundreds of models from other providers) without installing an additional provider package. [Get started with AI Gateway](https://vercel.com/ai-gateway).

## Setup

Install the Z.AI provider with:

```bash
npm i @ai-sdk/zai
```

## Provider Instance

Import the default provider instance from `@ai-sdk/zai`:

```ts
import { zai } from '@ai-sdk/zai';
```

The provider reads the API key from `ZAI_API_KEY` by default. To configure it explicitly, use `createZai`:

```ts
import { createZai } from '@ai-sdk/zai';

const zai = createZai({
  apiKey: process.env.ZAI_API_KEY,
});
```

## Language Models

```ts
import { zai } from '@ai-sdk/zai';
import { generateText } from 'ai';

const { text } = await generateText({
  model: zai('glm-5.3'),
  prompt: 'Explain why the sky is blue.',
});

console.log(text);
```

The provider supports streaming, reasoning, function tools, JSON object output, and URL-based image and video input on compatible GLM models.
