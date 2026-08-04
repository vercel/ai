---
'@ai-sdk/moonshotai': patch
---

feat(provider/moonshotai): own the chat implementation, support video input. The provider no longer builds on `@ai-sdk/openai-compatible`; the converter, language model, and helpers are owned by the package. Video file parts (e.g. `mediaType: 'video/mp4'`) are converted to Moonshot's `video_url` content parts for video-capable models (`kimi-k3`, `kimi-k2.7-code`, `kimi-k2.6`, `kimi-k2.5`). Audio and PDF file parts now throw client-side (the API rejects those part types). `reasoningHistory: 'preserved'` now maps to Moonshot's `thinking.keep: 'all'` request field (previously a no-op, the API ignores `reasoning_history`).
