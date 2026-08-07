---
'@ai-sdk/harness-claude-code': patch
---

feat (harness-claude-code): drive a `claude` executable already present in the sandbox instead of downloading one. The bootstrap otherwise installs two copies of the Claude Code binary, around 470MB of the 785MB it writes, because both `@anthropic-ai/claude-agent-sdk` and `@anthropic-ai/claude-code` ship it as a platform-specific optional dependency. Where a working executable already exists, the bootstrap drops from roughly 511MB to 40MB, and cold start from roughly 22s to 3s on a warm cache. The pnpm store is also discarded once the install finishes, since nothing reads it afterwards, which takes a full install from 785MB to 511MB. A hosted sandbox has no `claude`, so it takes the full install as before. Set `systemExecutable: false` to always install the pinned copy.
