---
'@ai-sdk/provider': major
---

## All model settings arguments have been unified to a shared `providerOptions` configuration option

### `generateText`

Before:

```ts
import { openai } from '@ai-sdk/openai';

const { steps, response } = await generateText({
  model: openai('gpt-4o', {
    temperature: 0.5,
  }),
});
```

After:

```ts
import { openai } from '@ai-sdk/openai';

const { steps, response } = await generateText({
  model: openai('gpt-4o'),
  providerOptions: {
    openai: {
      temperature: 0.5,
    },
  },
});
```

| Package                     | PR                                                                                                                                                                                             |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@ai-sdk/mistral`           | [5675](https://github.com/vercel/ai/pull/5675)                                                                                                                                                 |
| `@ai-sdk/amazon-bedrock`    | [5666](https://github.com/vercel/ai/pull/5666), [5869](https://github.com/vercel/ai/pull/5869)                                                                                                 |
| `@ai-sdk/openai`            | [5671](https://github.com/vercel/ai/pull/5671), [5867](https://github.com/vercel/ai/pull/5867), [5962](https://github.com/vercel/ai/pull/5962), [5868](https://github.com/vercel/ai/pull/5868) |
| `@ai-sdk/openai-compatible` | [5673](https://github.com/vercel/ai/pull/5673)                                                                                                                                                 |
| `@ai-sdk/google-vertex`     | [5870](https://github.com/vercel/ai/pull/5870), [5961](https://github.com/vercel/ai/pull/5961)                                                                                                 |
| `@ai-sdk/anthropic`         | [5960](https://github.com/vercel/ai/pull/5960)                                                                                                                                                 |
| `@ai-sdk/google`            | [5871](https://github.com/vercel/ai/pull/5871), [5961](https://github.com/vercel/ai/pull/5961)                                                                                                 |
| `@ai-sdk/groq`              | [5663](https://github.com/vercel/ai/pull/5663)                                                                                                                                                 |
| `@ai-sdk/cohere`            | [5674](https://github.com/vercel/ai/pull/5674)                                                                                                                                                 |
