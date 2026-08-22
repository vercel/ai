---
"@ai-sdk/harness": patch
"@ai-sdk/harness-opencode": patch
---

feat(harness): add sandbox-independent session export/import via `doExportSession` / `importFrom`

Session resume previously only worked while the originating sandbox still existed. This adds an optional `doExportSession()` method on `HarnessV1Session` that exports the complete conversation state as a host-persistable payload, and an `importFrom` option on `HarnessV1StartOptions` (and `HarnessAgent.createSession` / `session.exportSession()`) that reconstructs the exported conversation in a fresh sandbox. The OpenCode adapter implements both via OpenCode's `/sync/history` and `/sync/replay` APIs, preserving the native session id, tool activity, and compaction state.
