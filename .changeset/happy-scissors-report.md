---
'ai': patch
---

### `extractReasoningMiddleware()`: Delay sending `text-start` chunk to rendering resulting text before reasoning

When wrapping a text stream in extractReasoningMiddleware(), delay queing the text-start chunk until either reasoning-start was queued or the first text-delta is about to be sent, whichever comes first.

https://github.com/vercel/ai/pull/8036