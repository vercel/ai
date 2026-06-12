---
'@ai-sdk/google': patch
---

fix(google): emit base64-data file parts as `inlineData` on the pre-Gemini-3 legacy tool-result path, regardless of media type. Previously only images were sent as `inlineData` and everything else (PDF, audio, video, …) fell through to `JSON.stringify`, which Gemini tokenized as raw text — a single 5-page PDF was ~4M tokens vs. ~2,800 with `inlineData`, instantly tripping the 1,048,576 input-token limit.
