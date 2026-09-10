---
'@ai-sdk/provider': patch
'@ai-sdk/openai': patch
---

Add experimental OpenAI Live support through `openai.live()`, including server WebSocket connection settings, WebRTC SDP exchange, continuous audio and transcript events, and Responses or client delegation configuration. Extend the existing experimental realtime v4 specification with optional transport capabilities and continuous-session events.
