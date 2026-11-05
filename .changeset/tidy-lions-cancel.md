---
'@ai-sdk/replicate': patch
---

fix(replicate): cancel abandoned image predictions on abort or poll timeout

Image generations that were abandoned — the caller aborted via `abortSignal` or polling gave up after `maxPollAttempts` — stopped polling but left the prediction running on Replicate, where it kept consuming compute. The image model now sends a best-effort cancel request to `POST /predictions/{prediction_id}/cancel` in those cases. The cancel URL is built from the configured base URL instead of the response body's `urls.cancel`, so configured credentials are only sent to the provider origin. Cancellation uses only the provider headers, never reuses the aborted signal, is never retried, and never replaces the abort or timeout error.
