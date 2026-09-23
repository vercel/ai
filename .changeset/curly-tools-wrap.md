---
'@ai-sdk/anthropic': patch
---

Automatically wrap custom tool schemas with non-object roots or root unions for Anthropic, and unwrap arguments before returning tool calls. Preserve original tool inputs, examples, and conversation history. Wrapped tools buffer streaming arguments until the call completes. Batch requests requiring wrapping fail locally with a manual wrapping hint.
