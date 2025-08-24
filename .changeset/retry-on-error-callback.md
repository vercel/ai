---
'ai': minor
---

feat(ai/streamText): Add retry capability to onError callback

The onError callback in streamText now includes a retry function that allows transparent error recovery without forwarding errors to the stream. When retry() is called, the error is not forwarded to the stream and the step is retried.

Added retriedError parameter to prepareStep function to enable configuration changes based on the error that triggered the retry, such as switching to a backup model after an overload error.
