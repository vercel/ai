---
'@ai-sdk/harness-claude-code': patch
---

Preserve host tool numeric bounds, string lengths, array item counts, and defaults in the schemas advertised to Claude Code. Carry these fields as metadata so the host remains responsible for validating limits and applying defaults; `pattern` and `format` remain omitted.
