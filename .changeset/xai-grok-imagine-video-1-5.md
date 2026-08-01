---
'@ai-sdk/xai': patch
---

feat (provider/xai): support Grok Imagine Video 1.5. Adds the `grok-imagine-video-1.5` model id, native `1080p` for text-to-video and image-to-video (the standard `resolution: '1920x1080'` now maps to `1080p`), and an optional reference audio track for reference-to-video — supplied either as an `audio/*` entry in the top-level `inputReferences` option or via the `referenceAudioUrls` provider option. Reference-to-video remains capped at `720p`, so a `1080p` request in that mode is downgraded with a warning. Also fixes reference routing: previously any non-empty `inputReferences` array selected reference-to-video, so an array holding only a video reference sent `reference_images: []` with no usable references.
