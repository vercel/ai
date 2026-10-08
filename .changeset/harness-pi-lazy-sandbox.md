---
'@ai-sdk/harness-pi': patch
---

refactor(harness-pi): resolve sandbox paths on first use so session start makes no sandbox calls

Starting a Pi session no longer resolves the sandbox `HOME` or the `fileToolPathPolicy` denied roots. The harness resolves them the first time a native file tool runs or a turn has skills to write, and retries the resolution on the next use if it fails. A turn without skills or native file tool calls makes no sandbox calls.

A denied root that cannot be resolved now fails the native file tool call that needs it instead of failing session start.
