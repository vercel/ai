---
'@ai-sdk/openai-compatible': patch
---

Pass full error object (including code, type, param) instead of only message string in SSE stream error chunks. This allows consumers to programmatically distinguish between different error types.
