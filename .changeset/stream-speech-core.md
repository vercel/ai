---
'ai': patch
---

feat(ai): add experimental_streamSpeech

Streams speech audio from a string, a stream of text deltas, or text parts (each with an optional `voice` and `providerOptions`) using speech models that implement the experimental `Experimental_StreamingSpeechModelV4` extension. Returns a single-consumer `audioStream` / `fullStream` plus `usage`, `warnings`, `responses`, and `providerMetadata` promises. Provider `error` parts are non-fatal and reported through `onError` (default `console.error`). A user abort or a cancel rejects the result promises immediately. Exports the `Experimental_SpeechTextPart`, `Experimental_SpeechStreamPart`, `Experimental_SpeechStreamUsage`, and `Experimental_StreamSpeechResult` types, adds an optional `cause` to `NoSpeechGeneratedError`, and adds `Experimental_MockStreamingSpeechModelV4` to `ai/test`.
