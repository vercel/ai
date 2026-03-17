---
'@ai-sdk/openai-compatible': patch
---

fix(openai-compatible): include full error object in chat SSE stream error chunks

Previously, only `error.message` was forwarded to consumers in chat stream error parts, dropping `code`, `type`, and `param`. This aligns the chat model with the completion model, which already forwards the full error object.
