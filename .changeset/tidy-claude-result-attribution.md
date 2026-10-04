---
'@ai-sdk/harness-claude-code': patch
---

Fix resumed turns ending with empty text when Claude Code emits a background-task notification result before processing the host prompt. Wait for a result associated with the initial prompt or a steering message, while retaining compatibility with older CLIs that do not echo message UUIDs and handling cancelled or discarded prompts.
