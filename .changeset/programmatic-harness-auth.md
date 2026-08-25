---
'@ai-sdk/harness': patch
'@ai-sdk/harness-acp': patch
'@ai-sdk/harness-claude-code': patch
'@ai-sdk/harness-cline': patch
'@ai-sdk/harness-codex': patch
'@ai-sdk/harness-cursor': patch
'@ai-sdk/harness-deepagents': patch
'@ai-sdk/harness-fx': patch
'@ai-sdk/harness-grok-build': patch
'@ai-sdk/harness-opencode': patch
'@ai-sdk/harness-pi': patch
---

Allow harness sessions to authenticate from an isolated environment supplied through the `auth` option, without mutating or falling back to the host process environment.
