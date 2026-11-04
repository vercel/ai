---
'@ai-sdk/google': patch
---

Forward explicit speech language codes to Gemini TTS for single- and multi-speaker requests, including the shared Vertex Gemini adapter. Omitted languages and `language: 'auto'` retain automatic detection without an unsupported-language warning.
