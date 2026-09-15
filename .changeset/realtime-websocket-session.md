---
'ai': patch
'@ai-sdk/react': patch
---

Add the client-delegation-first realtime WebSocket runtime with session lifecycle, exact final duration, bounded event queues and command acknowledgement tracking, transcripts, context append, and reversible capture. Continuous sessions support PCM16 audio-chunk playback over an application relay with a recoverable live-edge buffer policy. Legacy turn-based WebSockets retain queued playback and frontend tool handling.

Remove the deferred managed Responses coordinator, autoContinueTools option, backend usage state, and Live tool-result aliases. Continuous text and delegation handling belong to the application; sendTextMessage and addToolOutput reject continuous sessions. Server-confirmed provider delegation and turn-based audio-delta on the continuous profile fail explicitly. maxPlaybackBufferSeconds is supported only for continuous PCM sessions.

Fence callbacks, startup publications, tool results, and teardown by connection attempt. Validate token setup before opening a client-secret socket, require explicit relay transport mode, and include WebSocket URL, protocol values, and runtime timeouts/buffer settings in React session configuration keys.
