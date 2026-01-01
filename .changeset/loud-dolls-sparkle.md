---
'@ai-sdk/google': patch
---

Fixes the 'AI_NoOutputGeneratedError' for the Google provider when using 'codeExecution' with structured output. Provider tool calls are no longer mapping to finishReasons meant for client side tool calls.
