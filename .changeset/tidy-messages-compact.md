---
'ai': patch
---

Add standalone message compaction with explicit built-in or custom strategies, recent-history retention, durable checkpoints, and caller-supplied token counting. Callers choose when to compact, and can retain recent messages without a token budget or supply explicit counters to enforce main and summary input budgets.

Preserve retained reasoning and native context, reject incomplete summaries, and fit summaries before discarding recent history. Callers can choose whether to retain the entire current turn.
