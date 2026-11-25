# AI SDK - Perplexity Provider

The **[Perplexity provider](https://ai-sdk.dev/providers/ai-sdk-providers/perplexity)** for the [AI SDK](https://ai-sdk.dev/docs)
contains language model support for Perplexity's Agent API, including web search, citations, function tools, and structured output.

> **Deploying to Vercel?** With Vercel's AI Gateway you can access Perplexity (and hundreds of models from other providers) — no additional packages, API keys, or extra cost. [Get started with AI Gateway](https://vercel.com/ai-gateway).

## Setup

```bash
npm i ai @ai-sdk/perplexity
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Usage

```ts
import { perplexity } from '@ai-sdk/perplexity';
import { generateText } from 'ai';

const { text } = await generateText({
  model: perplexity('low'),
  prompt: 'What are the latest developments in quantum computing?',
});
```

See the [Perplexity Provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/perplexity) for more information.
