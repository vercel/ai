---
'@ai-sdk/provider-utils': patch
---

Fall back to TextDecoder when TextDecoderStream is unavailable (e.g. React Native / Expo), fixing streamText SSE parsing crashes.
