---
'@ai-sdk/harness': patch
'@ai-sdk/harness-claude-code': patch
---

fix(harness-claude-code): when attaching to a running bridge fails, stop the recorded bridge process and the processes it started before respawning, so the replacement can bind the port instead of failing with `EADDRINUSE`
