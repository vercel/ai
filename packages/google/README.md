# AI SDK - Google Provider

The **[Google provider](https://ai-sdk.dev/providers/ai-sdk-providers/google)** for the [AI SDK](https://ai-sdk.dev/docs) contains language model support for the [Google Generative AI](https://ai.google/discover/generativeai/) APIs.

> **Deploying to Vercel?** With Vercel's AI Gateway you can access Google (and hundreds of models from other providers) — no additional packages, API keys, or extra cost. [Get started with AI Gateway](https://vercel.com/ai-gateway).

## Setup

```bash
npm i ai @ai-sdk/google
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Usage

```ts
import { google } from '@ai-sdk/google';
import { generateText } from 'ai';

const { text } = await generateText({
  model: google('gemini-3.1-pro-preview'),
  prompt: 'Write a vegetarian lasagna recipe for 4 people.',
});
```

See the [Google Provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/google) for more information.
