---
'ai': patch
---

feat(ai): retry failed reads of the response stream with `streamText` `streamRetries`

When `streamRetries` is configured, a failed read of an opened response stream (for example a dropped connection after HTTP 200) is now retried like a provider error event, and `onError` can request a retry for it. Aborts and timeouts are not retried. Without `streamRetries`, behavior is unchanged.
