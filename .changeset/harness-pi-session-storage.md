---
'@ai-sdk/harness-pi': patch
---

feat(harness-pi): keep the Pi session in an optional caller-provided append-only `sessionStorage`, so lifecycle state holds only the id of the entry the session ends at

The harness appends each new Pi session entry with its `entryId`, `parentEntryId` and Pi session `version`, through the optional `appendMany` when the storage has it. A storage can ignore a retried append, and `read` can return only the entries that lead to `leafId`.
