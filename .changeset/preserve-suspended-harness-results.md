---
'@ai-sdk/harness': patch
---

Preserve host tool results that finish after a turn begins suspending. Wait for dispatched work before returning the continuation, deliver saved results on resume without rerunning tools, and retain the resumed step completion event.
