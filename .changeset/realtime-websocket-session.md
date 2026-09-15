---
'ai': patch
'@ai-sdk/react': patch
---

Add the client-delegation-first realtime WebSocket runtime with session lifecycle, exact final duration, bounded event queues and command acknowledgement tracking, transcripts, context append, and reversible capture. Continuous sessions support PCM16 audio-chunk playback over an application relay with a recoverable live-edge buffer policy. Legacy turn-based WebSockets retain queued playback and frontend tool handling.

Remove the deferred managed Responses coordinator, autoContinueTools option, backend usage state, and Live tool-result aliases. Continuous text and delegation handling belong to the application; sendTextMessage and addToolOutput reject continuous sessions. Server-confirmed provider delegation and turn-based audio-delta on the continuous profile fail explicitly. maxPlaybackBufferSeconds is supported only for continuous PCM sessions.

Fence callbacks, startup publications, tool results, and teardown by connection attempt. Validate token setup before opening a client-secret socket, require explicit relay transport mode, and include WebSocket URL, protocol values, and runtime timeouts/buffer settings in React session configuration keys.

Retain immediate local capture for explicit legacy preconnect streams, including owned-track cleanup and capture continuity through asynchronous setup. Signal transport closing before draining accepted terminal events, share reentrant close settlement, and cancel stale readiness and deadlines. Enforce 128 KiB frame and combined buffered-send budgets only for Live continuous sessions, using actual encoded wire bytes; oversized manual operations remain recoverable while startup and automatic audio failures close the session. Legacy startup, text, tool output, and audio retain their pre-Live behavior without these byte caps. Live pending-audio overflow drains accepted terminal usage within the existing one-second drain window. Validate final provider-transformed WebSocket URL syntax without removing native authentication query parameters.
