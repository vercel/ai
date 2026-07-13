---
'@ai-sdk/provider-utils': patch
---

Add experimental transcription-stream WebSocket envelope (standard doStream-over-WebSocket serialization): frame type constants, `experimental_parseTranscriptionStreamClientFrame`, `experimental_serializeTranscriptionStreamPart`, and `experimental_parseTranscriptionStreamPart` (all APIs are exported with experimental prefixes). `serializeTranscriptionStreamPart` returns `undefined` for payloads that are not JSON-serializable (callers drop the frame) and serializes cross-realm `Error` payloads by brand check.
