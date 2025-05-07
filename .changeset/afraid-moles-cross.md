---
'@ai-sdk/rsc': major
'ai': major
---

### The `ai/rsc` package has been moved separately to `@ai-sdk/rsc`.


Before:

```ts
import { createStreamableValue } from 'ai/rsc';

const stream = createStreamableValue('');
```

After:

```bash
npm install @ai-sdk/rsc
```

```ts
import { createStreamableValue } from '@ai-sdk/rsc';

const stream = createStreamableValue('');
```

Commit: https://github.com/vercel/ai/pull/5542
