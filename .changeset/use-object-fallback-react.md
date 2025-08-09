---
'@ai-sdk/react': patch
---

Fix `experimental_useObject()` to support environments without `ReadableStream`/`TextDecoderStream` (e.g., React Native/Expo) by adding a non-streaming JSON fallback. Also add tests for non-stream responses and empty bodies. Fixes #7817.


