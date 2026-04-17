---
'ai': patch
---

feat(ai): validate tool context against contextSchema at runtime

Tool execution and approval callbacks now validate each tool's `toolsContext` entry against its `contextSchema`. Invalid tool context now throws `TypeValidationError` with tool-context validation metadata in `error.context`.
