---
'@ai-sdk/sandbox-vercel': patch
---

Reject network policy mutations when an existing Vercel Sandbox policy contains response rules instead of silently dropping request restrictions. Inspect raw session metadata before taking ownership of a custom policy to detect response rules omitted by native SDK readback, including during harness credential brokering.
