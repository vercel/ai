# AI SDK - Groq Provider

The **[Groq provider](https://ai-sdk.dev/providers/ai-sdk-providers/groq)** for the [AI SDK](https://ai-sdk.dev/docs)
contains language model support for the Groq chat and completion APIs, transcription support, and browser search tool.

> **Deploying to Vercel?** With Vercel's AI Gateway you can access Groq (and hundreds of models from other providers) — no additional packages, API keys, or extra cost. [Get started with AI Gateway](https://vercel.com/ai-gateway).

## Setup

```bash
npm i ai @ai-sdk/groq
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Usage

```ts
import { groq } from '@ai-sdk/groq';
import { generateText } from 'ai';

const { text } = await generateText({
  model: groq('gemma2-9b-it'),
  prompt: 'Write a vegetarian lasagna recipe for 4 people.',
});
```

See the [Groq Provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/groq) for more information.
