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

fix(harness): keep silent sandbox bridge connections alive with WebSocket pings and reconnect when a peer stops responding, controllable via `keepAliveMs` option for bridge-backed harness adapters
