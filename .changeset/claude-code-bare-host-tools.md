---
'@ai-sdk/harness-claude-code': patch
---

Route bare-name host tool calls through Claude Code tool aliases and classify them as host-executed calls throughout streaming and permission handling. Preserve built-in tools and other MCP tool names by excluding them from aliasing.
