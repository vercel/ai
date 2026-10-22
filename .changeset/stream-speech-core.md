---
'ai': patch
---

feat(ai): add experimental_streamSpeech

Streams speech audio from a string, a stream of text deltas, or text parts (each with an optional `voice` and `providerOptions`) using speech models that implement the experimental `Experimental_StreamingSpeechModelV4` extension. Returns a single-consumer `audioStream` / `fullStream` plus `usage`, `warnings`, `responses`, and `providerMetadata` promises. Provider `error` parts are non-fatal and reported through `onError` (default `console.error`). Adds `Experimental_SpeechTextPart` and, in `ai/test`, `Experimental_MockStreamingSpeechModelV4`.
