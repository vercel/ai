---
'@ai-sdk/harness': patch
'@ai-sdk/harness-acp': patch
'@ai-sdk/harness-claude-code': patch
'@ai-sdk/harness-codex': patch
'@ai-sdk/harness-cursor': patch
'@ai-sdk/harness-deepagents': patch
'@ai-sdk/harness-github-copilot': patch
'@ai-sdk/harness-grok-build': patch
'@ai-sdk/harness-opencode': patch
---

Keep silent sandbox bridge connections alive with WebSocket pings and reconnect when a peer stops responding. Add `keepaliveMs` to `SandboxChannel` and bridge-backed harness settings (default: 20 seconds; `0` disables it).
