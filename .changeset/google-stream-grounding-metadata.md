---
'@ai-sdk/google': patch
---

fix(provider/google): preserve groundingMetadata and urlContextMetadata when they arrive in a stream chunk before the finishReason chunk
