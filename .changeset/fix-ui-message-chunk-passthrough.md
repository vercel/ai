---
'ai': patch
---

fix(ai): use passthrough() in uiMessageChunkSchema for forward compatibility

Replaced z.strictObject() with z.object().passthrough() in uiMessageChunkSchema to prevent
AI_TypeValidationError when a newer server sends fields (e.g. providerMetadata) that an older
cached client schema doesn't recognize. This makes the stream protocol forward-compatible
across patch/minor versions.
