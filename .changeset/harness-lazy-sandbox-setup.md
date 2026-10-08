---
'@ai-sdk/harness': patch
---

feat(harness): defer sandbox session setup to first use with sandboxConfig.setup: 'lazy'

`sandboxConfig.setup: 'lazy'` moves the session's sandbox setup (`onBootstrap` when its marker is missing, the session work directory, and `onSession`) from `createSession()` to the first file, exec or spawn operation that the adapter or a host tool performs on the sandbox. A session whose turns never touch the sandbox makes no sandbox calls. Concurrent first operations share one setup run, and a failed setup is retried on the next operation. The default, `'eager'`, keeps the current behavior.

`createSession()` rejects `'lazy'` for an adapter that declares a sandbox bootstrap recipe, such as Claude Code or Codex, before it acquires or touches a sandbox.
