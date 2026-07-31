---
'@ai-sdk/xai': patch
---

feat (provider/xai): support Grok Imagine Video 1.5 — native 1080p resolution and reference audio for reference-to-video, via either the top-level `inputReferences` option (audio references are now routed to `reference_audios` instead of being sent as reference images) or the `referenceAudioUrls` provider option. Adds the `grok-imagine-video-1.5` model id.
