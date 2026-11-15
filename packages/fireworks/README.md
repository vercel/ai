# AI SDK - Fireworks Provider

The **[Fireworks provider](https://ai-sdk.dev/providers/ai-sdk-providers/fireworks)** for the [AI SDK](https://ai-sdk.dev/docs) contains language model and image model support for the [Fireworks](https://fireworks.ai) platform.

> **Deploying to Vercel?** With Vercel's AI Gateway you can access Fireworks (and hundreds of models from other providers) — no additional packages, API keys, or extra cost. [Get started with AI Gateway](https://vercel.com/ai-gateway).

## Setup

```bash
npm i ai @ai-sdk/fireworks
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Usage

```ts
import { fireworks } from '@ai-sdk/fireworks';
import { generateText } from 'ai';

const { text } = await generateText({
  model: fireworks('accounts/fireworks/models/deepseek-v3'),
  prompt: 'Write a JavaScript function that sorts a list:',
});
```

See the [Fireworks Provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/fireworks) for more information.
