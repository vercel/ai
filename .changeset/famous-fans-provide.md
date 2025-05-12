---
'ai': major
---

## `LlamaIndexAdapter` has been extracted to a separate package `@ai-sdk/llamaindex`

Before:

```ts
import { LlamaIndexAdapter } from 'ai';

LlamaIndexAdapter.toDataStreamResponse(stream);
```

After:

```bash
pnpm add @ai-sdk/llamaindex
```

```ts
import { toDataStreamResponse } from '@ai-sdk/llamaindex';

toDataStreamResponse(stream);
```

Commit: https://github.com/vercel/ai/pull/5934
