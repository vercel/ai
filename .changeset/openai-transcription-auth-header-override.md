---
'@ai-sdk/openai': patch
---

Fix realtime transcription auth header handling: per-call `authorization` headers now override configuration headers regardless of header-key casing (last case-variant wins), and the `Bearer` scheme is matched case-insensitively.
