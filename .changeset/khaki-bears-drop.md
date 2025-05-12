---
'@ai-sdk/provider': major
'@ai-sdk/openai': major
'@ai-sdk/azure': major
'ai': major
---

## `structuredOutputs` is now enabled by default in `@ai-sdk/openai`

Before:

```ts
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

const result = await generateText({
  model: openai('gpt-4o-2024-08-06', { structuredOutputs: true }),
});
```

After:

```ts
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

const result = await generateText({
  model: openai('gpt-4o-2024-08-06'),
  providerOptions: {
    openai: {
      // You have to explicitly opt out of structured outputs now
      // (it's enabled by default, wasn't before)
      // structuredOutputs: false,
    },
  },
});
```

Commit: https://github.com/vercel/ai/pull/5990
