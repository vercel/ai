---
'@ai-sdk/anthropic': patch
---

Reject conflicting inline tool additions when a named tool choice falls back to auto or the internal JSON response tool limits available application tools, including definitions replayed from conversation history. Only validate definitions emitted in the request, preserving warning-only handling of ignored additions on the initial system message.
