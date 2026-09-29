---
'@ai-sdk/harness-claude-code': patch
---

fix(harness-claude-code): forward subagent and task activity as raw stream parts

Expose `agentProgressSummaries` and `forwardSubagentText` through `createClaudeCode`.
