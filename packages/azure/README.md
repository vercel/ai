# AI SDK - Azure OpenAI Provider

The **[Azure provider](https://ai-sdk.dev/providers/ai-sdk-providers/azure)** for the [AI SDK](https://ai-sdk.dev/docs) contains language model support for the Azure OpenAI API.

> **Deploying to Vercel?** With Vercel's AI Gateway you can access Azure OpenAI (and hundreds of models from other providers) — no additional packages, API keys, or extra cost. [Get started with AI Gateway](https://vercel.com/ai-gateway).

## Setup

```bash
npm i ai @ai-sdk/azure
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Usage

```ts
import { azure } from '@ai-sdk/azure';
import { generateText } from 'ai';

const { text } = await generateText({
  model: azure('gpt-4o'), // your deployment name
  prompt: 'Write a vegetarian lasagna recipe for 4 people.',
});
```

See the [Azure OpenAI Provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/azure) for more information.
