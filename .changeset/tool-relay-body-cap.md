---
"@ai-sdk/harness-opencode": patch
---

Cap the tool relay request body at 16 MiB and answer 413 instead of buffering an unbounded POST.
