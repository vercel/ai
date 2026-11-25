# AI SDK - xAI Grok Provider

The **[xAI Grok provider](https://ai-sdk.dev/providers/ai-sdk-providers/xai)** for the [AI SDK](https://ai-sdk.dev/docs)
contains language model support for the xAI chat and completion APIs.

> **Deploying to Vercel?** With Vercel's AI Gateway you can access xAI (and hundreds of models from other providers) — no additional packages, API keys, or extra cost. [Get started with AI Gateway](https://vercel.com/ai-gateway).

## Setup

```bash
npm i ai @ai-sdk/xai
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Usage

```ts
import { xai } from '@ai-sdk/xai';
import { generateText } from 'ai';

const { text } = await generateText({
  model: xai('grok-4.7'),
  prompt: 'Write a vegetarian lasagna recipe for 4 people.',
});
```

See the [xAI Grok Provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/xai) for more information.
