---
'@ai-sdk/alibaba': patch
---

feat(alibaba): support video file parts

Video file parts (`video/*`) are now sent as Alibaba `video_url` content, from a URL or as a base64 data URL. Previously every non-image file part threw `UnsupportedFunctionalityError`.
