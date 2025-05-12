---
'@ai-sdk/provider': major
---

## `logprobs` has been removed from core, in favour of provider-specific logprobs implementations

Before:

```ts
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

const result = streamText({
  model: openai('gpt-3.5-turbo'),
  prompt: 'Invent a new holiday and describe its traditions.',
  providerOptions: {
    openai: {
      logprobs: 2,
    },
  },
});

for await (const part of result.fullStream) {
  switch (part.type) {
    case 'finish': {
      console.log('Logprobs:', part.logprobs);
      break;
    }
  }
}
```

After:

```ts
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

const result = streamText({
  model: openai('gpt-3.5-turbo'),
  prompt: 'Invent a new holiday and describe its traditions.',
  providerOptions: {
    openai: {
      logprobs: 2,
    },
  },
});

for await (const part of result.fullStream) {
  switch (part.type) {
    case 'finish': {
      console.log('Logprobs:', part.providerMetadata?.openai.logprobs);
      break;
    }
  }
}
```

Commit: https://github.com/vercel/ai/pull/5896
