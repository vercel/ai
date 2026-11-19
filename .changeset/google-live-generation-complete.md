---
'@ai-sdk/google': patch
'@ai-sdk/google-vertex': patch
---

fix(google, google-vertex): finish live transcription streams without the 3-second grace period

`gemini-3.5-transcribe-live` ends each segment with `generationComplete` and never sends `turnComplete`, so live transcription streams always waited out the 3-second finish grace period and merged all segments into one `transcript-final` without separating whitespace. Segments now complete on `generationComplete`, and streams finish as soon as server voice activity detection shows that all sent audio has been transcribed.

Adds `providerOptions.google.streaming.automaticActivityDetection.disabled` (`googleVertex` on Vertex) for push-to-talk input: the audio stream is transcribed as a single turn without splitting at pauses, and the transcript is finalized as soon as the audio input closes.
