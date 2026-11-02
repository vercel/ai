---
"@ai-sdk/mcp": patch
---

`parseErrorResponse` now uses a `typeof input !== 'string'` check instead of `instanceof Response` to decide whether to read `status` and `await text()`. The previous `instanceof` check silently failed when the caller passed a `Response` produced in a different module realm (common when the SDK is consumed via undici-backed fetches in a Node application), which surfaced as an unhelpful `"[object Response]"` thrown from OAuth error paths and broke the SDK's built-in 401-driven token refresh.
