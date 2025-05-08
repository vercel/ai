---
'@ai-sdk/provider': major
---

## Language Model V2

### `LanguageModelV1Middleware` has been renamed to `LanguageModelV2Middleware` and is now exported from `@ai-sdk/provider`

Before:

```ts
import { LanguageModelV1 } from 'ai';
```

After:

```ts
import { LanguageModelV2 } from '@ai-sdk/provider';
```

chore (provider): cleanup request and rawRequest (language model v2)
chore (provider): merge rawRequest into request (language model v2)
chore (provider): refactor usage (language model v2)
chore (provider): change getSupportedUrls to supportedUrls (language model v2)
chore (provider): extract LanguageModelV2File
chore (provider): remove prompt type from language model v2 spec
Remove `Experimental_LanguageModelV2Middleware` type

Commit: https://github.com/vercel/ai/pull/5775
Commit: https://github.com/vercel/ai/pull/5994
Commit: https://github.com/vercel/ai/pull/5690
Commit: https://github.com/vercel/ai/pull/5634
Commit: https://github.com/vercel/ai/pull/5653
Commit: https://github.com/vercel/ai/pull/5604
Commit: https://github.com/vercel/ai/pull/6011
