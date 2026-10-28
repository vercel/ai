# AI SDK - Z.AI Provider

The **Z.AI provider** for the [AI SDK](https://ai-sdk.dev/docs) contains language model support for [Z.AI](https://z.ai/) GLM models.

> **Deploying to Vercel?** With Vercel's AI Gateway you can access Z.AI (and hundreds of models from other providers) without installing an additional provider package. [Get started with AI Gateway](https://vercel.com/ai-gateway).

## Setup

```bash
npm i ai @ai-sdk/zai
```

## Usage

```ts
import { zai } from '@ai-sdk/zai';
import { generateText } from 'ai';

const { text } = await generateText({
  model: zai('glm-5.3'),
  prompt: 'Explain why the sky is blue.',
});

console.log(text);
```

See the [Z.AI Provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/zai) for more information.
