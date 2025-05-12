---
'@ai-sdk/openai-compatible': major
'@ai-sdk/amazon-bedrock': major
'@ai-sdk/google-vertex': major
'@ai-sdk/togetherai': major
'@ai-sdk/deepinfra': major
'@ai-sdk/fireworks': major
'@ai-sdk/provider': major
'@ai-sdk/mistral': major
'@ai-sdk/cohere': major
'@ai-sdk/google': major
'@ai-sdk/openai': major
'ai': major
---

## Embedding Model V2

### Rename `.rawResponse` to `.response`

#### `embed`

Before:

```ts
import { embed } from 'ai';

const { rawResponse } = await embed();
```

After:

```ts
import { embed } from 'ai';

const { response } = await embed();
```

#### `LanguageModelV2`

Also renamed to `rawResponse` to `response`


### Switch to `providerOptions`

#### `embed`

Before:

```ts
import { openai } from '@ai-sdk/openai';
import { embed } from 'ai';

const { embedding } = await embed({
  model: openai('gpt-4o', {
    dimensions: 10
  }),
});
```

After:

```ts
import { openai } from '@ai-sdk/openai';
import { embed } from 'ai';

const { embedding } = await embed({
  model: openai('gpt-4o'),
  providerOptions: {
    openai: {
      dimensions: 10
    }
  }
})
```

#### `embedMany`

Before:

```ts
import { openai } from '@ai-sdk/openai';
import { embedMany } from 'ai';

const { embeddings } = await embedMany({
  model: openai('gpt-4o', {
    dimensions: 10
  }),
})
```

After:

```ts
import { openai } from '@ai-sdk/openai';
import { embedMany } from 'ai';

embedMany({
  model: openai('gpt-4o'),
  providerOptions: {
    openai: {
      dimensions: 10
    }
  }
})
```

Commit: https://github.com/vercel/ai/pull/5698
Commit: https://github.com/vercel/ai/pull/5699
Commit: https://github.com/vercel/ai/pull/5696
