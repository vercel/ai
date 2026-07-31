# AI SDK - MiniMax Provider

The **[MiniMax provider](https://ai-sdk.dev/providers/ai-sdk-providers/minimax)** for the [AI SDK](https://ai-sdk.dev/docs) contains language model support for the [MiniMax](https://www.minimax.io/) platform, including the MiniMax-M model series.

> **Deploying to Vercel?** With Vercel's AI Gateway you can access MiniMax (and hundreds of models from other providers) — no additional packages, API keys, or extra cost. [Get started with AI Gateway](https://vercel.com/ai-gateway).

## Setup

The MiniMax provider is available in the `@ai-sdk/minimax` module. You can install it with

```bash
npm i @ai-sdk/minimax
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Provider Instance

You can import the default provider instance `minimax` from `@ai-sdk/minimax`:

```ts
import { minimax } from '@ai-sdk/minimax';
```

## Language Model Example

```ts
import { minimax } from '@ai-sdk/minimax';
import { generateText } from 'ai';

const { text } = await generateText({
  model: minimax('minimax-m3'),
  prompt: 'Write a JavaScript function that sorts a list:',
});
```

## Thinking Mode Example

```ts
import { minimax } from '@ai-sdk/minimax';
import { generateText } from 'ai';

const { text } = await generateText({
  model: minimax('minimax-m3'),
  prompt: 'Solve this problem step by step: What is 15% of 240?',
  providerOptions: {
    minimax: {
      thinking: { type: 'adaptive' },
    },
  },
});
```

## Video Generation Example

```ts
import { minimax } from '@ai-sdk/minimax';
import { experimental_generateVideo as generateVideo } from 'ai';

const { video } = await generateVideo({
  model: minimax.video('MiniMax-H3'),
  prompt: 'A white kitten chases a butterfly across a sunlit garden.',
  aspectRatio: '16:9',
  duration: 5,
});
```

## Documentation

Please check out the **[MiniMax provider](https://ai-sdk.dev/providers/ai-sdk-providers/minimax)** for more information.
