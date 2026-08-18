# AI SDK - Perplexity Provider

The **[Perplexity provider](https://ai-sdk.dev/providers/ai-sdk-providers/perplexity)** for the [AI SDK](https://ai-sdk.dev/docs)
contains language model support for Perplexity's Agent API, including web search, citations, function tools, and structured output.

## Features

- Real-time web search grounding for accurate, up-to-date responses
- Agent API presets from `fast` through `xhigh`
- Direct access to supported third-party models through Perplexity
- Native tools for web search, URL fetching, code execution, finance, MCP, and connectors
- AI SDK function tools, structured output, reasoning streams, and multi-turn tool calls

> **Deploying to Vercel?** With Vercel's AI Gateway you can access Perplexity (and hundreds of models from other providers) — no additional packages, API keys, or extra cost. [Get started with AI Gateway](https://vercel.com/ai-gateway).

## Setup

The Perplexity provider is available in the `@ai-sdk/perplexity` module. You can install it with:

```bash
npm i @ai-sdk/perplexity
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Provider Instance

You can import the default provider instance `perplexity` from `@ai-sdk/perplexity`:

```ts
import { perplexity } from '@ai-sdk/perplexity';
```

## Example

```ts
import { perplexity } from '@ai-sdk/perplexity';
import { generateText } from 'ai';

const { text } = await generateText({
  model: perplexity('low'),
  prompt: 'What are the latest developments in quantum computing?',
});
```

Legacy Sonar model IDs remain available as deprecated aliases for Agent API
presets. Because presets can select different models and tools, review the
[migration notes](https://ai-sdk.dev/providers/ai-sdk-providers/perplexity#migrating-from-sonar)
before upgrading an existing application.

## Documentation

Please check out the **[Perplexity provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/perplexity)** for more information.
