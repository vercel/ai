---
'@ai-sdk/google': patch
---

Send tool errors and denied tool executions under `functionResponse.response.error` so Gemini can distinguish failures from successful tool results.
