# AI SDK - Parallel Provider

The **[Parallel provider](https://ai-sdk.dev/providers/ai-sdk-providers/parallel)** for the [AI SDK](https://ai-sdk.dev/docs)
provides web-grounded decisions with typed answers, probabilities, and citations.

## Setup

```sh
npm i ai @ai-sdk/parallel
```

## Usage

```ts
import { parallel } from '@ai-sdk/parallel';
import { experimental_decide as decide } from 'ai';

const result = await decide({
  model: parallel.decisionModel('fast'),
  state: { company: 'Parallel', website: 'https://parallel.ai' },
  questions: {
    hasSearch: {
      type: 'boolean',
      instructions: 'Does this company offer a web search API?',
    },
  },
});

console.log(result.answers.hasSearch);
console.log(result.providerMetadata?.parallel?.citations);
```

See the [Parallel Provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/parallel) for more information.
