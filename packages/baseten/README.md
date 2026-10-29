# AI SDK - Baseten Provider

The **[Baseten provider](https://ai-sdk.dev/providers/ai-sdk-providers/baseten)** for the [AI SDK](https://ai-sdk.dev/docs) contains language model and embedding model support for the [Baseten](https://baseten.co) platform.

> **Deploying to Vercel?** With Vercel's AI Gateway you can access Baseten (and hundreds of models from other providers) — no additional packages, API keys, or extra cost. [Get started with AI Gateway](https://vercel.com/ai-gateway).

## Setup

```bash
npm i ai @ai-sdk/baseten
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Usage

```ts
import { baseten } from '@ai-sdk/baseten';
import { generateText } from 'ai';

const { text } = await generateText({
  model: baseten('deepseek-ai/DeepSeek-V3-0324'),
  prompt: 'What is the meaning of life?',
});
```

See the [Baseten Provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/baseten) for more information.
