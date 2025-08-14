---
'ai': patch
---

### `extractReasoningMiddleware()`: delay sending `text-start` chunk to prevent rendering final text before reasoning

When wrapping a text stream in `extractReasoningMiddleware()`, delay queing the `text-start` chunk until either `reasoning-start` chunk was queued or the first `text-delta` chunk is about to be queued, whichever comes first.

https://github.com/vercel/ai/pull/8036
