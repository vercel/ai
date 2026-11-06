---
'@ai-sdk/baseten': patch
'@ai-sdk/openai-compatible': patch
---

Avoid empty structured-output answers from Baseten's DeepSeek V4 Pro 0813 when reasoning is enabled. Fall back to JSON prompt instructions while keeping reasoning and SDK output validation, and report the fallback through request transformation warnings.
