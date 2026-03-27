---
"ai": patch
---

fix: prevent quadratic memory growth in streamText with default text() output by returning undefined from parsePartialOutput, skipping unnecessary JSON.stringify on every chunk
