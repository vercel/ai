# AI SDK - GMI Cloud Provider

The **GMI Cloud provider** for the [AI SDK](https://ai-sdk.dev/docs) contains language model support for [GMI Cloud](https://www.gmicloud.ai), offering GPU inference for open-weight models over an OpenAI-compatible API.

> **Deploying to Vercel?** With Vercel's AI Gateway you can access GMI Cloud (and hundreds of models from other providers) — no additional packages, API keys, or extra cost. [Get started with AI Gateway](https://vercel.com/ai-gateway).

## Setup

```bash
npm i ai @ai-sdk/gmicloud
```

## Usage

```ts
import { gmicloud } from '@ai-sdk/gmicloud';
import { generateText } from 'ai';

const { text } = await generateText({
  model: gmicloud('deepseek-ai/DeepSeek-V4-Flash-0731'),
  prompt: 'What is the capital of France?',
});
```

See the [GMI Cloud Provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/gmicloud) for more information.
