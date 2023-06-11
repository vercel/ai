---
"ai-connector": patch
---

- Create `/react` sub-package. 
- Create `import { useChat, useCompletion } from 'ai-connector/react'` and mark React as an optional peer dependency so we can add more framework support in the future.
- Also renamed `set` to `setMessages` and `setCompletion` to unify the API naming as we have `setInput` too.
- Added an `sendExtraMessageFields` field to `useChat` that defaults to `false`, to prevent OpenAI errors when `id` is not filtered out.
