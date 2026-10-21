---
'@ai-sdk/google': patch
---

Add videoMetadata support for file parts. Users can now pass videoMetadata (startOffset, endOffset, fps) via providerOptions on file parts to control video clipping and frame rate when using the Google Generative AI provider.
