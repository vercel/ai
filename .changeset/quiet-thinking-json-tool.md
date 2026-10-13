---
'@ai-sdk/anthropic': patch
---

fix(anthropic): allow structured output with thinking on legacy models

When Anthropic thinking is enabled and native structured output is unavailable,
the JSON response tool is now offered with automatic tool choice instead of
being forced, avoiding Anthropic's incompatible request error.
