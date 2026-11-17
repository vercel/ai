---
'ai': patch
---

fix(ai): Apply exponential backoff and respect retry headers for stream retries, including callback-directed retries. Abort retry waits when the request or stream is cancelled.
