---
'@ai-sdk/mcp': patch
---

BREAKING (experimental): managed event subscriptions now require `ttlMs: number | null` instead of accepting an `expiresAt` creation input. Use a duration in milliseconds or `null` to watch until stopped. Subscription responses retain `expiresAt` as the backend-calculated deadline. Update managed event adapters together with callers.
