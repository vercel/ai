# AI SDK - xAI Grok Provider

The **[xAI Grok provider](https://ai-sdk.dev/providers/ai-sdk-providers/spacexai)** for the [AI SDK](https://ai-sdk.dev/docs)
contains language model support for the xAI chat and completion APIs.

> **Deploying to Vercel?** With Vercel's AI Gateway you can access xAI (and hundreds of models from other providers) — no additional packages, API keys, or extra cost. [Get started with AI Gateway](https://vercel.com/ai-gateway).

## Setup

The xAI Grok provider is available in the `@ai-sdk/spacexai` module. You can install it with

```bash
npm i @ai-sdk/spacexai
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Provider Instance

You can import the default provider instance `spacexai` from `@ai-sdk/spacexai`:

```ts
import { spacexai } from '@ai-sdk/spacexai';
```

## Example

```ts
import { spacexai } from '@ai-sdk/spacexai';
import { generateText } from 'ai';

const { text } = await generateText({
  model: spacexai('grok-4.6'),
  prompt: 'Write a vegetarian lasagna recipe for 4 people.',
});
```

## Documentation

Please check out the **[xAI Grok provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/spacexai)** for more information.
