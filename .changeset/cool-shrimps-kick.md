---
'@ai-sdk/provider-utils': major
---

### Removed deprecated `CoreToolCall` and `CoreToolResult` types

Before:

```ts
import { CoreToolCall, CoreToolResult } from '@ai-sdk/provider-utils';
```

After:

```ts
import { ToolCall, ToolResult } from '@ai-sdk/provider-utils';
```

Commit: https://github.com/vercel/ai/pull/5776
