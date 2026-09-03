---
'@ai-sdk/harness-claude-code': patch
---

feat (harness-claude-code): implement `readHistory` from the CLI's own transcripts. The adapter reads the session transcript Claude Code itself persists under `~/.claude/projects/<encoded cwd>/<sessionId>.jsonl` — the same store `claude --resume` uses — and normalizes it to the harness history shape with full fidelity: text, reasoning, tool calls with inputs, tool results with their recorded output, and the raw transcript record on every message. Reads go through the sandbox session, so they work in hosted sandboxes and on the local machine alike. Incremental reads via the cursor return only what was recorded since.
