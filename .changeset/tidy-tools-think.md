---
'@ai-sdk/anthropic': patch
---

Fall back to automatic tool choice with a warning when manual thinking is enabled with a required or named tool choice, avoiding an Anthropic API 400 error. Named tool choices send only the selected tool.
