---
'@ai-sdk/elevenlabs': patch
---

feat(elevenlabs): streaming speech over WebSocket; type v4/v3-conversational model ids

`ElevenLabsSpeechModel` implements the experimental `Experimental_StreamingSpeechModelV4` (`doStream()`) over the text-to-speech `stream-input` WebSocket, forwarding text deltas as they arrive and reporting `usage.inputCharacters` (Unicode code points). Adds `eleven_v4`, `eleven_v4_turbo`, and `eleven_v3_conversational` to the typed speech model IDs. The API key is sent in the WebSocket's first message (native `WebSocket` works), the portable `outputFormat` maps to an ElevenLabs `output_format` (or set `streaming.outputFormat` natively), text parts with a different voice are rejected, partial words are held back to whitespace, and keepalives are sent while the text stream is idle unless `inactivityTimeout` is set. `generateSpeech` ignores `streaming` options with a warning.
