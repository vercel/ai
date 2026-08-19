---
'@ai-sdk/harness': patch
'@ai-sdk/harness-claude-code': patch
'@ai-sdk/harness-codex': patch
'@ai-sdk/harness-opencode': patch
'@ai-sdk/harness-deepagents': patch
'@ai-sdk/harness-acp': patch
---

feat (harness): let sandbox providers separate harness state from the workspace. `HarnessV1NetworkSandboxSession` gains an optional `stateDirectory`; the framework and every bridge adapter now resolve their generated state — bootstrap recipes and their dependencies (`.harness-bootstrap/…`) and per-session run state (`.agent-runs/…`) — through the new `harnessV1StateDirectory()` helper instead of the sandbox's working directory. Hosted providers change nothing: when `stateDirectory` is omitted, state stays under `defaultWorkingDirectory`, where snapshot machinery preserves it. Providers whose working directory is a directory the user owns can now keep infrastructure out of the workspace entirely.
