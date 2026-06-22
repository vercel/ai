---
"@ai-sdk/provider-utils": patch
---

Detect ISO BMFF audio (M4A/MP4) where `ftyp` follows a 4-byte box length, so `transcribe()` no longer falls back to `audio/wav` for valid m4a/mp4 input.
