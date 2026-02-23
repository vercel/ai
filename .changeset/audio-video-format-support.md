---
'@ai-sdk/openai-compatible': patch
---

fix(provider/openai-compatible): support additional audio formats and video

Audio formats beyond wav/mp3 and all video formats are now passed as data URIs
via image_url instead of being rejected, allowing downstream backends to handle
them natively. Audio file URLs are also now supported via image_url.
