---
"ai": patch
---

fix(ai): tag step/chunk timeout aborts with `TimeoutError` reason

When `timeout: { stepMs }` or `timeout: { chunkMs }` fires, the abort reason is now a `TimeoutError` `DOMException`, matching what `AbortSignal.timeout()` produces natively. Consumers can distinguish a framework timeout from a user-initiated cancel via `signal.reason.name === 'TimeoutError'`.
