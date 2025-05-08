---
'@ai-sdk/openai-compatible': major
'@ai-sdk/google-vertex': major
'@ai-sdk/provider': major
'@ai-sdk/mistral': major
'@ai-sdk/cohere': major
'@ai-sdk/google': major
'@ai-sdk/openai': major
'ai': major
---

## Rename `.rawResponse` to `.response`

### `embed`

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

### `LanguageModelV2`

Also renamed to `rawResponse` to `response`

Commit: https://github.com/vercel/ai/pull/5699
Commit: https://github.com/vercel/ai/pull/5604
