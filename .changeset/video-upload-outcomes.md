---
'ai': patch
'@ai-sdk/provider': patch
---

Represent videos delivered directly to caller-managed storage with an explicit uploaded outcome. Video generation reports `uploadedVideos` without downloading or synthesizing video bytes; access `video` only when `videos` is nonempty.
