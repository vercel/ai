---
"@ai-sdk/harness-pi": patch
---

fix(harness-pi): deliver tool results submitted after cross-process resume instead of silently dropping them. When a turn paused on host input (e.g. a tool approval) is resumed in a new process, the rerun is now held until the framework has re-delivered the results for every journal-pending host tool call; the results are written into the restored session journal so the model sees the real outputs instead of synthetic "No result provided" errors. Results delivered before a suspend are also flushed into the journal so a later resume still sees them.
