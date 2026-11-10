---
'ai': patch
---

Fix excessive CPU usage when streaming long arrays with `Output.array` or `streamObject`. Parse and validate completed elements incrementally instead of repeatedly processing the entire accumulated array on every text chunk.
