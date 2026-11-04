# AI SDK - Prodia Provider

The **[Prodia provider](https://ai-sdk.dev/providers/ai-sdk-providers/prodia)** for the [AI SDK](https://ai-sdk.dev/docs) adds image model support for the [Prodia API](https://docs.prodia.com/).

> **Deploying to Vercel?** With Vercel's AI Gateway you can access Prodia (and hundreds of models from other providers) — no additional packages, API keys, or extra cost. [Get started with AI Gateway](https://vercel.com/ai-gateway).

## Setup

```bash
npm i ai @ai-sdk/prodia
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Usage

```ts
import fs from 'node:fs';
import { prodia } from '@ai-sdk/prodia';
import { generateImage } from 'ai';

const { image } = await generateImage({
  model: prodia.image('inference.flux-fast.schnell.txt2img.v2'),
  prompt: 'A cat wearing a intricate robe',
});

const filename = `image-${Date.now()}.png`;
fs.writeFileSync(filename, image.uint8Array);
console.log(`Image saved to ${filename}`);
```

See the [Prodia Provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/prodia) for more information.
