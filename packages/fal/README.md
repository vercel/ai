# AI SDK - fal Provider

The **[fal provider](https://ai-sdk.dev/providers/ai-sdk-providers/fal)** for the [AI SDK](https://ai-sdk.dev/docs) contains image model support for the [fal.ai API](https://fal.ai/).

> **Deploying to Vercel?** With Vercel's AI Gateway you can access fal (and hundreds of models from other providers) — no additional packages, API keys, or extra cost. [Get started with AI Gateway](https://vercel.com/ai-gateway).

## Setup

```bash
npm i ai @ai-sdk/fal
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Usage

```ts
import { fal } from '@ai-sdk/fal';
import { generateImage } from 'ai';
import fs from 'fs';
const { image } = await generateImage({
  model: fal.image('fal-ai/flux/schnell'),
  prompt: 'A cat wearing a intricate robe',
});

const filename = `image-${Date.now()}.png`;
fs.writeFileSync(filename, image.uint8Array);
console.log(`Image saved to ${filename}`);
```

See the [fal Provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/fal) for more information.
