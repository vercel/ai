---
'@ai-sdk/provider-utils': patch
---

Add experimental transcription-stream WebSocket envelope (standard doStream-over-WebSocket serialization): frame type constants, `parseTranscriptionStreamClientFrame`, `serializeTranscriptionStreamPart`, and `parseTranscriptionStreamPart`. `serializeTranscriptionStreamPart` returns `undefined` for payloads that are not JSON-serializable (callers drop the frame) and serializes cross-realm `Error` payloads by brand check.
