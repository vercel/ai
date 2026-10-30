---
"@ai-sdk/anthropic": patch
---

fix(anthropic): when the JSON response tool is in use but the model answers in text without calling it (for example with manual thinking, where the forced tool choice is downgraded to `auto`), return the final answer text instead of dropping it. Text before a tool call, result, or message continuation is still dropped.
