---
'@ai-sdk/harness-acp': patch
'@ai-sdk/harness-claude-code': patch
'@ai-sdk/harness-codex': patch
'@ai-sdk/harness-deepagents': patch
'@ai-sdk/harness-opencode': patch
---

fix(harness): copy bridge lockfile as `pnpm-lockfile.yaml` in `dist/` so `pnpm pack` includes it in published tarballs
