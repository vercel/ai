---
'@ai-sdk/harness-claude-code': patch
---

feat (harness-claude-code): drive a `claude` executable already present in the sandbox instead of downloading one. The bootstrap otherwise installs two copies of the Claude Code binary, around 470MB of the 785MB it writes, because both `@anthropic-ai/claude-agent-sdk` and `@anthropic-ai/claude-code` ship it as a platform-specific optional dependency. Where a working executable already exists, cold start drops from roughly 22s and 785MB to 2.5s and 78MB. A hosted sandbox has no `claude`, so it takes the full install as before. Set `systemExecutable: false` to always install the pinned copy, or pass an absolute path to choose one explicitly.
