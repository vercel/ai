---
'@ai-sdk/harness-claude-code': patch
'@ai-sdk/harness': patch
---

fix(harness): stop diagnosing caller-initiated aborts as bridge errors, and serialize bridge turns so a start racing an aborted turn's teardown no longer overlaps it (bounded by a teardown grace period, after which the start proceeds as before)
