---
'@ai-sdk/xai': patch
---

fix (provider/xai): surface xAI's video `request_id` on failed generations. The video model now attaches xAI's resource `request_id` as a `requestId` property on every error thrown during polling — content-moderation 400s (the `APICallError` is augmented in place, preserving its type and status), timeouts, `failed`/`expired` statuses, and the `respect_moderation` block — so callers can correlate a failed generation with xAI's own logs (it was already exposed as `providerMetadata.xai.requestId` on success).
