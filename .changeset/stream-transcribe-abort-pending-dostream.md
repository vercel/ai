---
'ai': patch
---

Cancelling the `experimental_streamTranscribe` `fullStream` now also aborts a still-pending `doStream` setup, so a model whose `doStream` has not yet resolved is cancelled instead of leaking.
