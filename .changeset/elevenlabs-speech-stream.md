---
'@ai-sdk/elevenlabs': patch
---

feat(elevenlabs): streaming speech over WebSocket; type v4/v3-conversational model ids

`ElevenLabsSpeechModel` implements the experimental `doStream()` over the text-to-speech `stream-input` WebSocket, forwarding text deltas as they arrive and reporting `usage.inputCharacters` (Unicode code points). Adds `eleven_v4`, `eleven_v4_turbo`, and `eleven_v3_conversational` to the typed speech model IDs. The API key is sent in the WebSocket's first message (native `WebSocket` works), partial words are held back to word boundaries, and keepalives are sent while the text stream is idle.
