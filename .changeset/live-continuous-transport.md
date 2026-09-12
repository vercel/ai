---
'@ai-sdk/provider': patch
'@ai-sdk/openai': patch
---

Add experimental OpenAI Live support through `openai.experimental_live()`, including server WebSocket connection settings, WebRTC SDP exchange and client permissions, continuous audio and transcript events, and Responses or client delegation configuration. Expose separate camelCase startup and update options. Extend the existing experimental realtime v4 specification with optional connection capabilities, startup and finalization semantics, and provider-neutral continuous-session events.
