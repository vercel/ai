---
'@ai-sdk/anthropic': patch
---

Add `maxTokens` to the `advisor_20260301` tool and forward it as `max_tokens` to cap each advisor sub-inference independently of executor output.
