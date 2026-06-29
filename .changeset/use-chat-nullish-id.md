---
"@ai-sdk/react": patch
---

Treat nullish `useChat` IDs the same as omitted IDs so the chat instance is not recreated on every render.
