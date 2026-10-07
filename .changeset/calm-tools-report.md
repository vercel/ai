---
'@ai-sdk/google': patch
'@ai-sdk/openai': patch
---

Preserve tool errors in OpenAI Chat Completions and Responses by wrapping their payloads in an `error` object. Send Google tool errors and denied executions under `functionResponse.response.error`.
