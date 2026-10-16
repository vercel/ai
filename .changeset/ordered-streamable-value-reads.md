---
'@ai-sdk/rsc': patch
---

Fix overlapping `readStreamableValue` iterator reads returning duplicate updates by processing `next()` calls in order.
