---
'ai': patch
'@ai-sdk/react': patch
---

Generate default chat IDs on first access so `useChat()` can prerender without reading a random value when the ID is not used during rendering.
