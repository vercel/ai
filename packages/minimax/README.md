# AI SDK - MiniMax Provider

The **[MiniMax provider](https://ai-sdk.dev/providers/ai-sdk-providers/minimax)** for the [AI SDK](https://ai-sdk.dev/docs) contains language model support for the [MiniMax](https://www.minimax.io/) platform, including the MiniMax-M model series.

> **Deploying to Vercel?** With Vercel's AI Gateway you can access MiniMax (and hundreds of models from other providers) — no additional packages, API keys, or extra cost. [Get started with AI Gateway](https://vercel.com/ai-gateway).

## Setup

```bash
npm i ai @ai-sdk/minimax
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Usage

```ts
import { minimax } from '@ai-sdk/minimax';
import { generateText } from 'ai';

const { text } = await generateText({
  model: minimax('minimax-m3'),
  prompt: 'Write a JavaScript function that sorts a list:',
});
```

See the [MiniMax Provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/minimax) for more information.
