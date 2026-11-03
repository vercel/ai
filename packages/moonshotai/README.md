# AI SDK - Moonshot AI Provider

The **[Moonshot AI provider](https://ai-sdk.dev/providers/ai-sdk-providers/moonshotai)** for the [AI SDK](https://ai-sdk.dev/docs) contains language model support for the [Kimi API Platform](https://platform.kimi.ai/docs), including the Kimi model series.

> **Deploying to Vercel?** With Vercel's AI Gateway you can access Moonshot AI (and hundreds of models from other providers) — no additional packages, API keys, or extra cost. [Get started with AI Gateway](https://vercel.com/ai-gateway).

## Setup

```bash
npm i ai @ai-sdk/moonshotai
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Usage

```ts
import { moonshotai } from '@ai-sdk/moonshotai';
import { generateText } from 'ai';

const { text } = await generateText({
  model: moonshotai('kimi-k3'),
  prompt: 'Write a JavaScript function that sorts a list:',
});
```

See the [Moonshot AI Provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/moonshotai) for more information.
