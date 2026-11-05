---
'@ai-sdk/replicate': patch
---

fix(replicate): cancel predictions that are abandoned by abort or polling timeout

Image and video generations that were abandoned — the caller aborted via `abortSignal`, polling gave up after `maxPollAttempts`, or the video poll timeout elapsed — stopped polling but left the prediction running on Replicate, where it kept consuming compute. The provider now sends a best-effort cancel request to the prediction's `urls.cancel` endpoint in those cases. Cancellation never reuses the aborted signal, is never retried, and never replaces the abort or timeout error.
