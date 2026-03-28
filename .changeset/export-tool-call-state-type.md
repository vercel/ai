---
'ai': patch
---

Export `ToolCallState` type from the `ai` package. This is a string union type representing all possible states of a tool call invocation (`input-streaming`, `input-available`, `approval-requested`, `approval-responded`, `output-available`, `output-error`, `output-denied`). It can be used to type helper functions, component props, and other constructs that work with tool call states.
