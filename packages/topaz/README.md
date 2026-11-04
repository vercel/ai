# AI SDK - Topaz Labs Provider

The **Topaz Labs provider** for the [AI SDK](https://ai-sdk.dev/docs) contains image and video model support for the [Topaz Labs API](https://developer.topazlabs.com).

> **Deploying to Vercel?** With Vercel's AI Gateway you can access Topaz Labs (and hundreds of models from other providers) — no additional packages, API keys, or extra cost. [Get started with AI Gateway](https://vercel.com/ai-gateway).

## Setup

```bash
npm i ai @ai-sdk/topaz
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Usage

```ts
import { topaz } from '@ai-sdk/topaz';
import { generateImage } from 'ai';

const { image } = await generateImage({
  model: topaz.image('wonder-3.5'),
  prompt: {
    images: ['https://example.com/photo.jpg'],
  },
  size: '4096x4096',
});
```

See the [Topaz Labs Provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/topaz) for more information.
