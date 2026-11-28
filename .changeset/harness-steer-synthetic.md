---
'@ai-sdk/harness': patch
'@ai-sdk/harness-claude-code': patch
---

feat(harness): add a `synthetic` option to `experimental_steerTurn` and `experimental_steer` for text the user didn't write; the Claude Code harness sends it as `isSynthetic`, so Claude Code doesn't count it as the user's own words
