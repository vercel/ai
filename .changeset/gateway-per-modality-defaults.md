---
'@ai-sdk/gateway': patch
'ai': patch
---

String model IDs now resolve through per-modality Gateway factories instead of the full default `gateway` provider, and `@ai-sdk/gateway` ships one module per source file. Bundles now only include the Gateway model they use: previously `generateText`, `embed`, and the other single-function imports also bundled the Gateway video, speech, transcription, batch, and tool code (about 70 KB minified).
