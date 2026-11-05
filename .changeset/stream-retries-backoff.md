---
"ai": patch
---

`streamText` waits between `streamRetries` mid-stream recoveries using the same exponential backoff and `retry-after` handling as `maxRetries`.
