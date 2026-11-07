---
'@ai-sdk/anthropic': patch
---

Reject conflicting inline tool additions when a named tool choice falls back to auto or the internal JSON response tool limits available application tools, including definitions replayed from conversation history.
