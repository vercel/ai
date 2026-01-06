---
"@ai-sdk/anthropic": patch
---

feat(anthropic): enable structured outputs support for Claude Haiku 4.5

Claude Haiku 4.5 now supports structured outputs. When tools are defined with `strict: true`, the `strict` property is now correctly included in the request body for Claude Haiku 4.5, matching the behavior of Claude Sonnet 4.5 and Claude Opus 4.5.
