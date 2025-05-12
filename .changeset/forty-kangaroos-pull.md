---
'ai': major
---

## `onCompletion` has been removed in favour of `onFinal`

Before:

```ts
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

const result = streamText({
  model: openai('gpt-4-turbo'),
  prompt: 'What is the weather in San Francisco?',
});

return result.toAIStream({
  onCompletion() {
    // ...
  },
});
```

After:

```ts
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

const result = streamText({
  model: openai('gpt-4-turbo'),
  prompt: 'What is the weather in San Francisco?',
});

return result.toAIStream({
  onFinal() {
    // ...
  },
});
```

Commit: https://github.com/vercel/ai/pull/6152
