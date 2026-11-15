# AI SDK - Hume Provider

The **[Hume provider](https://ai-sdk.dev/providers/ai-sdk-providers/hume)** for the [AI SDK](https://ai-sdk.dev/docs)
contains support for the Hume API.

> **Deploying to Vercel?** With Vercel's AI Gateway you can access Hume (and hundreds of models from other providers) — no additional packages, API keys, or extra cost. [Get started with AI Gateway](https://vercel.com/ai-gateway).

## Setup

```bash
npm i ai @ai-sdk/hume
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Usage

```ts
import { hume } from '@ai-sdk/hume';
import { generateSpeech } from 'ai';

const result = await generateSpeech({
  model: hume.speech('aurora'),
  text: 'Hello, world!',
});
```

See the [Hume Provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/hume) for more information.
