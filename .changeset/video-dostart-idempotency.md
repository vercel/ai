---
"@ai-sdk/gateway": patch
"ai": patch
---

fix (ai/gateway): make retried `doStart` calls idempotent

`generateVideo` retries `doStart`, which creates a billable generation, so a
retry after a lost response could start a second one. It now mints one
idempotency token per logical start — outside the retry closure — and forwards it
as an `idempotency-key` header, so a provider that deduplicates (the Vercel AI
Gateway does) sees the same key on every attempt. `GatewayVideoModel` simply
forwards the caller's headers rather than inferring retry identity from an
options object, which would collide across unrelated calls.
