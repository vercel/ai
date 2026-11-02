# AI SDK - Black Forest Labs Provider

The **[Black Forest Labs provider](https://ai-sdk.dev/providers/ai-sdk-providers/black-forest-labs)** for the [AI SDK](https://ai-sdk.dev/docs) adds image and video model support for the [Black Forest Labs API](https://docs.bfl.ai/).

> **Deploying to Vercel?** With Vercel's AI Gateway you can access Black Forest Labs (and hundreds of models from other providers) — no additional packages, API keys, or extra cost. [Get started with AI Gateway](https://vercel.com/ai-gateway).

## Setup

```bash
npm i ai @ai-sdk/black-forest-labs
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Usage

```ts
import fs from 'node:fs';
import { blackForestLabs } from '@ai-sdk/black-forest-labs';
import { generateImage } from 'ai';

const { image } = await generateImage({
  model: blackForestLabs.image('flux-pro-1.1'),
  prompt: 'A cat wearing a intricate robe',
});

const filename = `image-${Date.now()}.png`;
fs.writeFileSync(filename, image.uint8Array);
console.log(`Image saved to ${filename}`);
```

See the [Black Forest Labs Provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/black-forest-labs) for more information.
