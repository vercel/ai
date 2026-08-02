---
'@ai-sdk/moonshotai': patch
'@ai-sdk/openai-compatible': patch
---

feat(provider/moonshotai): support video input for Kimi models. Video file parts (e.g. `mediaType: 'video/mp4'`) are now converted to Moonshot's `video_url` content parts instead of throwing `'file part media type video/*' functionality not supported`. Applies to video-capable models such as `kimi-k3`, `kimi-k2.7-code`, `kimi-k2.6`, and `kimi-k2.5`; video URLs are downloaded and inlined as base64 before sending. Adds a `supportsVideo` option to the openai-compatible chat config and message conversion (default off, so other openai-compatible providers are unchanged).
