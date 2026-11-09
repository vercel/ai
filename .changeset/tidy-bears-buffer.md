---
"@ai-sdk/harness": patch
---

fix(harness): cap buffered unmatched tool results at 16 MiB

A tool result that arrives before its request is buffered until a matching
request collects it. Nothing bounded that buffer, so a result whose request
never arrives was retained for the life of the bridge process. Bound it to
16 MiB (matching the ACP sibling relay's request-body cap) and evict the
oldest entries once the cap is exceeded.
