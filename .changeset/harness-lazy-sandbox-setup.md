---
'@ai-sdk/harness': patch
---

feat(harness): defer sandbox setup, and optionally sandbox creation, to first use for harnesses without a bootstrap recipe

For a harness adapter that declares no sandbox bootstrap recipe (such as Pi), `HarnessAgent.createSession()` no longer runs the session's sandbox setup (`onBootstrap` when its marker is missing, the session work directory, and `onSession`) before the adapter starts. The setup runs on the first file, exec or spawn operation on the sandbox, and a failed setup is retried on the next one. Adapters with a recipe, such as Claude Code and Codex, keep setting up the sandbox in `createSession()`.

`sandboxSession` also accepts a `HarnessAgentSandboxCreator`, `{ defaultWorkingDirectory, createSandboxSession }`, to defer creating the sandbox itself. For an adapter without a recipe, `createSandboxSession` runs on the first file, exec or spawn operation, so a session whose turns never touch the sandbox never creates it. For any other adapter, `createSession()` calls it right away.
