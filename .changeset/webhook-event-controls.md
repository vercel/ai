---
'@ai-sdk/mcp': patch
---

Handle signed webhook gap and termination envelopes through an optional onControl callback. Persist the fresh cursor and truncation signal for gaps, and remove subscriptions after termination.
