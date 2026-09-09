---
'@ai-sdk/klingai': patch
---

Forward `webhookUrl` as `callback_url` in `doStart` for text-to-video, image-to-video, multi-image-to-video, and motion control. Explicit URLs take precedence over raw provider callback URLs. Callers provide a progress-aware receiver; `generateVideo({ webhook })` continues to fall back to polling.
