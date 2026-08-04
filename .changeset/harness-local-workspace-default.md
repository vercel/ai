---
'@ai-sdk/harness': patch
---

feat (harness): make `sandbox` optional on `HarnessAgent`. When it is omitted the harness runs on the local machine in `process.cwd()` as the current user, reusing the CLI configuration and credentials already there, so no hosted sandbox has to be provisioned for local development. This provides **no isolation**, and emits a warning once per process that can be silenced by setting the `AI_SDK_LOG_WARNINGS` global to `false` or to your own logger. Harness state generated in the working directory (`.harness-bootstrap/`, `.agent-runs/`, `.harness-local/`) is given a `.gitignore` so it stays out of `git status`.
