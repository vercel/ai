---
'@ai-sdk/harness-pi': patch
---

fix(harness-pi): stream pending compaction parts on the next turn

Emit compaction parts that occurred while no turn was active onto the next turn's stream so the compaction observation and summary are preserved.
