---
'@ai-sdk/provider': patch
'@ai-sdk/openai': patch
'ai': patch
'@ai-sdk/react': patch
---

Add optional browser-direct WebRTC for experimental client-delegated Live conversations alongside the existing WebSocket path. Exchange SDP through an application endpoint with `api.session`, configure server-owned data-channel permissions, and preserve committed React session ownership. Capture follows the selected sender track, borrowed tracks remain caller-owned, and disconnect recovery and finalization stay bounded. Applications continue to handle client delegation and submit context; Live session updates and Responses delegation remain unsupported.

Serialize microphone sender changes and close the peer if detachment fails, without stopping borrowed tracks. Validate nonempty SDP setup answers with a bounded response body, and document the same-origin broker authentication contract.
