---
'@ai-sdk/elevenlabs': patch
---

feat(elevenlabs): streaming speech over WebSocket; type v4/v3-conversational model ids

`ElevenLabsSpeechModel` implements the experimental `Experimental_StreamingSpeechModelV4` (`doStream()`) over the text-to-speech `stream-input` WebSocket, forwarding text deltas as they arrive and reporting `usage.inputCharacters` (Unicode code points). Adds `eleven_v4`, `eleven_v4_turbo`, and `eleven_v3_conversational` to the typed speech model IDs.
