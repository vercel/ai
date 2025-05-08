---
'@ai-sdk/openai-compatible': major
---

## `simulateStreaming` model option has been replaced with  `simulateStreamingMiddleware()` middleware

Before:

```ts
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

const result = generateText({
  model: openai('gpt-4o', { simulateStreaming: true }),
  prompt: 'Hello, world!',
});
```

After:

```ts
import { wrapLanguageModel, simulateStreamingMiddleware } from 'ai';

const model = wrapLanguageModel({
  model: openai('gpt-4o'),
  middleware: simulateStreamingMiddleware(),
});

const result = generateText({
  model,
  prompt: 'Hello, world!',
});
```

Commit: https://github.com/vercel/ai/pull/5639
