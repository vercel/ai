---
'@ai-sdk/openai': patch
---

Omit `id` from reasoning items when `store: false` — Azure OpenAI rejects requests where a stateless reasoning item includes an `id` field.
