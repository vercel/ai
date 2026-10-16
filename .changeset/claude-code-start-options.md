---
'@ai-sdk/harness-claude-code': patch
---

Add `plugins`, `enabledSkills` and `pathToClaudeCodeExecutable` to `createClaudeCode()`. They pass through to the Claude Agent SDK, so a caller can load a local plugin, enable only named skills instead of every skill found on disk, and start Claude Code through a wrapper.
