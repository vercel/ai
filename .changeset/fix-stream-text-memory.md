---
'ai': patch
---

fix(ai): avoid quadratic memory growth in streamText for plain text

The default `text()` output's `parsePartialOutput` now returns `undefined` instead of `{ partial: text }`, skipping the `JSON.stringify` call on every streaming chunk. This eliminates O(n²) string copies that caused ~350MB memory usage per stream.
