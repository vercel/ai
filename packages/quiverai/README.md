# AI SDK - QuiverAI Provider

The **QuiverAI provider** for the [AI SDK](https://ai-sdk.dev/docs) adds Arrow language-model and image-generation support for the [QuiverAI](https://quiver.ai/) API.

> **Deploying to Vercel?** With Vercel's AI Gateway you can access many models from other providers — no additional packages, API keys, or extra cost. [Get started with AI Gateway](https://vercel.com/ai-gateway).

## Setup

```bash
npm i ai @ai-sdk/quiverai
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Usage

```ts
import { quiverai } from '@ai-sdk/quiverai';
import { generateImage } from 'ai';
import fs from 'fs';

const { image } = await generateImage({
  model: quiverai.image('arrow-2'),
  prompt: 'A logo for the next AI Design startup',
});

const filename = `image-${Date.now()}.svg`;
fs.writeFileSync(filename, image.uint8Array);
console.log(`Image saved to ${filename}`);
```

See the [QuiverAI Provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/quiverai) for more information.
