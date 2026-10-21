---
'ai': patch
---

feat(ai): add experimental_streamSpeech

Streams speech audio from a string or a stream of text deltas using speech models that implement the experimental `SpeechModelV4.doStream()`. Returns a single-consumer `audioStream` / `fullStream` plus `usage`, `warnings`, `responses`, and `providerMetadata` promises.
