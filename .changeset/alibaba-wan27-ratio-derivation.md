---
'@ai-sdk/alibaba': patch
---

fix(alibaba): do not derive a ratio from an unsupported resolution for wan2.7 video models

When an unsupported resolution (e.g. `1024x768`) was passed to a wan2.7 text-to-video or reference-to-video model, the resolution was correctly warned about and ignored, but a `ratio` was still derived from that same ignored resolution and sent to the API. For 4:3/3:4 resolutions this produced a `ratio` (e.g. `4:3`) that wan2.7 models do not support, resulting in a request the API rejects. The ratio is now only derived from a resolution that was actually accepted.
