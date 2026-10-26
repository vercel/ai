# AI SDK - Replicate Provider

The **[Replicate provider](https://ai-sdk.dev/providers/ai-sdk-providers/replicate)** for the [AI SDK](https://ai-sdk.dev/docs) contains image model support for the Replicate API.

> **Deploying to Vercel?** With Vercel's AI Gateway you can access Replicate (and hundreds of models from other providers) — no additional packages, API keys, or extra cost. [Get started with AI Gateway](https://vercel.com/ai-gateway).

## Setup

```bash
npm i ai @ai-sdk/replicate
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Usage

```ts
import { replicate } from '@ai-sdk/replicate';
import { generateImage } from 'ai';

const { image } = await generateImage({
  model: replicate.image('black-forest-labs/flux-schnell'),
  prompt: 'The Loch Ness Monster getting a manicure',
});

const filename = `image-${Date.now()}.png`;
fs.writeFileSync(filename, image.uint8Array);
console.log(`Image saved to ${filename}`);
```

See the [Replicate Provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/replicate) for more information.
