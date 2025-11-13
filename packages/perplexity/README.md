# AI SDK - Perplexity Provider

The **[Perplexity provider](https://ai-sdk.dev/providers/ai-sdk-providers/perplexity)** for the [AI SDK](https://ai-sdk.dev/docs)
contains language model support for Perplexity's Sonar API - a powerful answer engine with real-time web search capabilities.

## Features

- Real-time web search grounding for accurate, up-to-date responses
- Support for advanced queries and follow-up questions
- Multiple tiers available:
  - **Sonar Pro**: Enhanced capabilities for complex tasks with 2x more citations
  - **Sonar**: Lightweight offering optimized for speed and cost
- Industry-leading answer quality
- Data privacy - no training on customer data
- Self-serve API access with scalable pricing

## Setup

The Perplexity provider is available in the `@ai-sdk/perplexity` module. You can install it with:

```bash
npm i @ai-sdk/perplexity
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
  model: perplexity('sonar-pro'),
  prompt: 'What are the latest developments in quantum computing?',
});
```

## Search API

The Perplexity provider includes a search tool that gives you access to Perplexity's Search API. This tool can be used with **any model that supports tool calling** (OpenAI, Anthropic, etc.) to give them web search capabilities powered by Perplexity.

```ts
import { openai } from '@ai-sdk/openai';
import { perplexity } from '@ai-sdk/perplexity';
import { generateText, stepCountIs } from 'ai';

const { text } = await generateText({
  model: openai('gpt-5-mini'),
  prompt: 'What are the latest AI developments? Use search.',
  tools: {
    search: perplexity.tools.search({
      max_results: 5,
      search_recency_filter: 'week',
    }),
  },
  stopWhen: stepCountIs(3),
});
```

The search tool supports:

- Single or multi-query searches
- Domain filtering (include/exclude specific domains)
- Language filtering
- Date range filtering
- Recency filtering (day, week, month, year)
- Custom result limits and token limits per page

## Documentation

Please check out the **[Perplexity provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/perplexity)** for more information.
