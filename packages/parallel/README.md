# AI SDK - Parallel Provider

The **[Parallel provider](https://ai-sdk.dev/providers/ai-sdk-providers/parallel)** for the [AI SDK](https://ai-sdk.dev/docs)
provides web-grounded decisions with typed answers, probabilities, and citations.

```sh
npm install @ai-sdk/parallel
```

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

Set `PARALLEL_API_KEY` or pass `apiKey` to `createParallel`.
Citation metadata retains URLs, titles, and evidence excerpts. Sources are shared
by all questions in a request; they are not attributed to individual answers.
