---
'ai': patch
'@ai-sdk/react': patch
---

Support capability-driven realtime sessions through application-owned WebSocket relays and WebRTC. Expose transcript, delegation, usage, and finalization metadata as `session` (`Experimental_RealtimeSessionState`). Managed sessions opt into automatic tool continuation with `autoContinueTools`; legacy realtime turns retain their existing automatic continuation behavior.

Add graceful close, bounded command history, fail-closed input queues, transient WebRTC recovery, and recoverable local playback gaps. Configure playback with `maxPlaybackBufferSeconds` and resume at the live edge with `resumePlayback()`. Use `connect({ capture: false })` for application-managed input, or stop and resume hardware capture without reconnecting through `stopAudioCapture()`, `startAudioCapture(stream)`, and `resumeAudioCapture()`.
