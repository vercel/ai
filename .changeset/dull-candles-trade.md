---
'@ai-sdk/openai-compatible': major
---

## Removed `simulateStreaming` from `@ai-sdk/openai` in favour of using middleware instead

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

TODO

Commit: https://github.com/vercel/ai/pull/5639
