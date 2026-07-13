---
'@ai-sdk/provider-utils': patch
'@ai-sdk/openai': patch
'@ai-sdk/xai': patch
---

Add `connectToWebSocket` to `@ai-sdk/provider-utils`: a shared WebSocket connect layer (constructor resolution, header hygiene, abort wiring, message decoding) analogous to `postToApi` for HTTP. The openai and xai streaming transcription models now use it instead of hand-rolled connects. For openai and xai this also means WebSocket constructor failures now surface as stream errors instead of throwing synchronously from `doStream`, an already-aborted signal no longer constructs a socket, and the caller's audio stream is cancelled on pre-open failures. Messages are processed in order with close handling deferred behind pending frames, audio send loops apply backpressure via the socket's bufferedAmount, and failed sends cancel the caller's audio stream.
