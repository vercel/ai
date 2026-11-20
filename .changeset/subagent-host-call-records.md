---
'@ai-sdk/harness-claude-code': patch
---

The Claude Code bridge kept the record of a subagent's host tool call for the rest of the turn, because a subagent's messages pass through unmapped. When the main agent later called the same host tool with the same input, the bridge matched that call to the old record and never sent it to the host, so the turn waited for a result that never came. The bridge now drops a subagent's record when the subagent's tool result passes through.
