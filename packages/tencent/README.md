# AI SDK - Tencent Cloud Provider

The **[Tencent Cloud provider](https://ai-sdk.dev/providers/ai-sdk-providers/tencent)** for the [AI SDK](https://ai-sdk.dev/docs) contains language model support for [TokenHub](https://www.tencentcloud.com/products/tokenhub) and video model support for TokenHub Kling models and [Video on Demand (VOD)](https://www.tencentcloud.com/products/vod) AIGC models.

> **Deploying to Vercel?** With Vercel's AI Gateway you can access Tencent Cloud (and hundreds of models from other providers) — no additional packages, API keys, or extra cost. [Get started with AI Gateway](https://vercel.com/ai-gateway).

## Setup

```bash
npm i ai @ai-sdk/tencent
```

## Usage

```ts
import { tencent } from '@ai-sdk/tencent';
import { generateText } from 'ai';

const { text } = await generateText({
  model: tencent('hy4'),
  prompt: 'What is the capital of France?',
});
```

See the [Tencent Cloud Provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/tencent) for more information.
