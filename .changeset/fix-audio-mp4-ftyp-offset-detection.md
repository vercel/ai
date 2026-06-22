---
'@ai-sdk/provider-utils': patch
---

Fix `audio/mp4` (m4a) detection: the `ftyp` signature was checked at byte offset 0, but ISO Base Media File Format boxes prefix `ftyp` with a 4-byte size field, placing `ftyp` at offset 4. Corrected to match the `M4A ` and `M4B ` brands at their actual offset — fixes `experimental_transcribe` mis-tagging iOS/Android/ffmpeg m4a recordings as `audio/wav` and getting rejected by OpenAI with HTTP 400.
