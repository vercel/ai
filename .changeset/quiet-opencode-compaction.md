---
'@ai-sdk/harness-opencode': patch
---

Handle native OpenCode compaction messages without streaming internal summaries as answer text. Preserve summary usage, emit the existing compaction completion event, and expose start/failure progress through raw events.
