---
'ai': major
---

## `experimental_wrapLanguageModel` is not experimental anymore

Before:

```ts
import { experimental_wrapLanguageModel } from 'ai';
```

After:

```ts
import { wrapLanguageModel } from 'ai';
```

Commit: https://github.com/vercel/ai/pull/5771
