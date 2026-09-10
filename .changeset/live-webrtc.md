---
'@ai-sdk/provider': patch
'@ai-sdk/openai': patch
'ai': patch
'@ai-sdk/react': patch
---

Add optional browser-direct WebRTC for experimental Live conversations alongside the existing WebSocket path. Exchange SDP through an HTTP endpoint, configure server-owned frontend event permissions, and expose the transport through `useRealtime`. Preserve capture ownership, bounded recovery and finalization, and include WebRTC examples and regression coverage.
