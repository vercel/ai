---
'ai': patch
---

Fix excessive CPU usage when streaming long arrays with `streamObject` array output. Parse and validate completed elements incrementally instead of repeatedly processing the entire accumulated array on every text chunk.
