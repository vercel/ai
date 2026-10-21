---
'ai': patch
---

feat(ai): add experimental_streamSpeech

Streams speech audio from a string or a stream of text deltas using speech models that implement the experimental `Experimental_StreamingSpeechModelV4` extension. Returns a single-consumer `audioStream` / `fullStream` plus `usage`, `warnings`, `responses`, and `providerMetadata` promises. Adds `Experimental_MockStreamingSpeechModelV4` to `ai/test`.
