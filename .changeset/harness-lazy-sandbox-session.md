---
'@ai-sdk/harness': patch
---

feat(harness): accept `{ defaultWorkingDirectory, createSandboxSession }` as `sandboxSession` in `HarnessAgent.createSession()` to create the sandbox on first use

For a harness adapter without a sandbox bootstrap recipe (such as Pi), `createSandboxSession` runs on the first file, exec or spawn operation, so a session whose turns never touch the sandbox never creates it. A failed attempt is retried on the next operation. For any other adapter, `createSession()` calls it right away. `defaultWorkingDirectory` sets the session work directory before the sandbox exists.
