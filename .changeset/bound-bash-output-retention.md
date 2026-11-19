---
'@ai-sdk/tool-bash': patch
'@ai-sdk/provider-utils': patch
'@ai-sdk/sandbox-vercel': patch
'@ai-sdk/sandbox-just-bash': patch
'@ai-sdk/anthropic': patch
---

Bound bash tool output collection before returning it from supporting sandbox adapters, and copy retained prefixes so truncated results do not keep large source strings alive. Preserve output text, omission counts, command completion, exit codes, and timeout behavior. Custom sandbox implementations remain compatible; just-bash's interpreter buffering remains subject to its native execution limits.
