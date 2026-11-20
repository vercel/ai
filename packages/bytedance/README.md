# AI SDK - ByteDance Provider

The **ByteDance provider** for the [AI SDK](https://ai-sdk.dev/docs) contains video model support for ByteDance's Seedance family of video generation models through the [BytePlus ModelArk](https://docs.byteplus.com/en/docs/ModelArk/Video_Generation_API) platform.

> **Deploying to Vercel?** With Vercel's AI Gateway you can access ByteDance (and hundreds of models from other providers) — no additional packages, API keys, or extra cost. [Get started with AI Gateway](https://vercel.com/ai-gateway).

## Setup

```bash
npm i ai @ai-sdk/bytedance
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Usage

```ts
import { byteDance, type ByteDanceVideoModelOptions } from '@ai-sdk/bytedance';
import { experimental_generateVideo as generateVideo } from 'ai';

const { video } = await generateVideo({
  model: byteDance.video('seedance-1-0-pro-250528'),
  prompt: 'A cat playing with a ball of yarn in a sunlit room',
  aspectRatio: '16:9',
  duration: 5,
  providerOptions: {
    bytedance: {
      watermark: false,
    } satisfies ByteDanceVideoModelOptions,
  },
});

console.log(video.url);
```

See the [ByteDance Provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/bytedance) for more information.
