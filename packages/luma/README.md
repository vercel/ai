# AI SDK - Luma Provider

The **Luma provider** for the [AI SDK](https://ai-sdk.dev/docs) contains support for Luma AI's state-of-the-art image generation models - Photon and Photon Flash.

> **Deploying to Vercel?** With Vercel's AI Gateway you can access Luma (and hundreds of models from other providers) — no additional packages, API keys, or extra cost. [Get started with AI Gateway](https://vercel.com/ai-gateway).

## Setup

```bash
npm i ai @ai-sdk/luma
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Usage

```ts
import { luma } from '@ai-sdk/luma';
import { generateImage } from 'ai';
import fs from 'fs';

const { image } = await generateImage({
  model: luma.image('photon-1'),
  prompt: 'A serene mountain landscape at sunset',
});

const filename = `image-${Date.now()}.png`;
fs.writeFileSync(filename, image.uint8Array);
console.log(`Image saved to ${filename}`);
```

See the [Luma Provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/luma) for more information.
