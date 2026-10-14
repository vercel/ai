---
'@ai-sdk/harness': patch
---

feat(harness): defer sandbox session setup to first use for harnesses without a bootstrap recipe

For a harness adapter that declares no sandbox bootstrap recipe (such as Pi), `HarnessAgent.createSession()` no longer runs the session's sandbox setup (`onBootstrap` when its marker is missing, the session work directory, and `onSession`) before the adapter starts. The setup runs on the first file, exec or spawn operation that the adapter or a host tool performs on the sandbox, so a session whose turns never touch the sandbox makes no setup calls. Concurrent first operations share one setup run, and a failed setup rejects the operation that triggered it and is retried on the next one. Adapters with a recipe, such as Claude Code and Codex, keep setting up the sandbox in `createSession()`.

A failing `onBootstrap` or `onSession` for such an adapter now surfaces on the first sandbox operation instead of in `createSession()`, and the `createSession()` abort signal no longer covers it.
