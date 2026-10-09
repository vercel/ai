---
'ai': patch
---

Fix duplicate text, reasoning, and step parts when resuming a fully replayed UI message stream after a disconnect. Rebuild the resumed response when a start chunk is replayed, while preserving streaming state for transports that resume with only remaining deltas.
