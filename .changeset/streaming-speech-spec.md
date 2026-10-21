---
'@ai-sdk/provider': patch
---

feat(provider): add experimental streaming speech model spec

Adds `Experimental_StreamingSpeechModelV4`, a `SpeechModelV4` extension with `doStream()` that takes the input text as a stream of text deltas and returns a stream of audio parts, plus `Experimental_`-prefixed stream option, part, result, and usage types. The stable `SpeechModelV4` is unchanged.
