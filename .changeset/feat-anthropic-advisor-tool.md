---
'@ai-sdk/anthropic': minor
---

Add support for the Anthropic advisor tool (`advisor_20260301`). The advisor tool lets a cheaper executor model (Sonnet/Haiku) consult a more capable advisor model (Opus) mid-generation within a single request — no orchestration code needed. Use via `anthropic.tools.advisor_20260301({ model: 'claude-opus-4-6', maxUses: 3 })`.
