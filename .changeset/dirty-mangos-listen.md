---
'ai': patch
---

feat(ai): validate tool context against contextSchema at runtime

Tool execution and approval callbacks now validate each tool's `toolsContext` entry against its `contextSchema`. Invalid tool context now throws `InvalidToolContextError` with the failing tool name, context value, and validation cause.
