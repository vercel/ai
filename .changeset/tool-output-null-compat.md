---
'ai': patch
---

Normalize missing or undefined tool outputs to `null` when parsing UI stream chunks, validating persisted UI messages, and converting UI messages to model messages so messages affected by [#15854](https://github.com/vercel/ai/issues/15854) or produced before [#15855](https://github.com/vercel/ai/pull/15855) can be replayed.
