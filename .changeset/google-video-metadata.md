---
'@ai-sdk/google': patch
'@ai-sdk/google-vertex': patch
---

Add videoMetadata support for file parts. Pass startOffset, endOffset, and fps through per-file providerOptions to control video clipping and frame rate with the Google and Google Vertex providers.
