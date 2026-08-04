---
"@ai-sdk/gateway": patch
"ai": patch
---

fix (ai/gateway): make retried `doStart` calls idempotent

`generateVideo` retries `doStart`, which creates a billable generation, so a
retry after a lost response could start a second one. The start options object is
now built once outside the retry closure, and `GatewayVideoModel` sends one
`idempotency-key` per options identity — stable across those retries, fresh for a
genuinely new call.
