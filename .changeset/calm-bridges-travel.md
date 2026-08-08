---
'@ai-sdk/provider-utils': patch
'@ai-sdk/harness': patch
'@ai-sdk/harness-codex': patch
'@ai-sdk/sandbox-vercel': patch
'@ai-sdk/sandbox-just-bash': patch
---

Add provider-owned guest path and directory operations, direct executable and
argv process spawning, and an opt-in preinstalled Codex bridge mode that skips
the adapter-owned pnpm bootstrap while preserving the existing default.
