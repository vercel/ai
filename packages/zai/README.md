# AI SDK - Z.AI Provider

The **[Z.AI provider](https://ai-sdk.dev/providers/ai-sdk-providers/zai)** for the [AI SDK](https://ai-sdk.dev/docs) contains language model support for the [Z.AI](https://z.ai) platform, including the GLM series of models.

> **Deploying to Vercel?** With Vercel's AI Gateway you can access Z.AI (and hundreds of models from other providers) — no additional packages, API keys, or extra cost. [Get started with AI Gateway](https://vercel.com/ai-gateway).

## Setup

The Z.AI provider is available in the `@ai-sdk/zai` module. You can install it with

```bash
npm i @ai-sdk/zai
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Provider Instance

You can import the default provider instance `zai` from `@ai-sdk/zai`:

```ts
import { zai } from '@ai-sdk/zai';
```

For custom configuration, you can import `createZai` and create a provider instance with your settings:

```ts
import { createZai } from '@ai-sdk/zai';

const zai = createZai({
  apiKey: process.env.ZAI_API_KEY ?? '',
});
```

## Language Model Example

```ts
import { zai } from '@ai-sdk/zai';
import { generateText } from 'ai';

const { text } = await generateText({
  model: zai('glm-5.2'),
  prompt: 'What is the meaning of life?',
});
```

## Documentation

Please check out the **[Z.AI provider](https://ai-sdk.dev/providers/ai-sdk-providers/zai)** for more information.
