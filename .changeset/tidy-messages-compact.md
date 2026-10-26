---
'ai': patch
---

Add standalone message compaction with recent-history retention, durable checkpoints, custom strategies, and caller-supplied token counting. Compact by message count without a token budget, or supply explicit counters to enforce main and summary input budgets.
