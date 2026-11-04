# AI SDK - Mistral Provider

The **[Mistral provider](https://ai-sdk.dev/providers/ai-sdk-providers/mistral)** for the [AI SDK](https://ai-sdk.dev/docs) contains language model, embedding model, and speech model support for Mistral APIs.

> **Deploying to Vercel?** With Vercel's AI Gateway you can access Mistral (and hundreds of models from other providers) — no additional packages, API keys, or extra cost. [Get started with AI Gateway](https://vercel.com/ai-gateway).

## Setup

```bash
npm i ai @ai-sdk/mistral
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Usage

```ts
import { mistral } from '@ai-sdk/mistral';
import { generateText } from 'ai';

const { text } = await generateText({
  model: mistral('mistral-large-latest'),
  prompt: 'Write a vegetarian lasagna recipe for 4 people.',
});
```

See the [Mistral Provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/mistral) for more information.
