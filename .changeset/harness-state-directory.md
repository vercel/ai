---
'@ai-sdk/harness': patch
'@ai-sdk/harness-claude-code': patch
'@ai-sdk/harness-codex': patch
'@ai-sdk/harness-opencode': patch
'@ai-sdk/harness-deepagents': patch
'@ai-sdk/harness-acp': patch
---

feat (harness): keep harness-generated state out of the sandbox workspace. The framework and every bridge adapter now resolve their generated state — bootstrap recipes and their dependencies (`.harness-bootstrap/…`) and per-session run state (`.agent-runs/…`) — through the new `harnessV1StateDirectory()` helper, which always resolves to a fixed directory (`~/.ai-sdk-harness`) under the sandbox's own HOME, never the sandbox's working directory. This is not configurable: every sandbox provider gets the same layout, so harness infrastructure never lands in a user-owned workspace. This changes the on-disk layout for every provider (a breaking change, acceptable given the experimental nature of this API) — sandboxes bootstrapped under the previous layout re-bootstrap once under the new path.
