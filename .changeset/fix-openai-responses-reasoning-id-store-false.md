---
'@ai-sdk/openai': patch
---

Omit `id` field from reasoning items when `store: false` in the Responses API input. Azure OpenAI rejects requests containing reasoning item IDs when storage is disabled. The `encrypted_content` field is sufficient for multi-turn reasoning without server-side persistence.
