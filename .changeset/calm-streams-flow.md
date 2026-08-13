---
'ai': patch
---

Avoid repeatedly cloning accumulated text in `readUIMessageStream` while
preserving independent snapshots for mutable nested values.
