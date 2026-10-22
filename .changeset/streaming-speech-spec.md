---
'@ai-sdk/provider': patch
---

feat(provider): add experimental streaming speech model spec

Adds `Experimental_StreamingSpeechModelV4`, a `SpeechModelV4` extension with `doStream()` that takes the input text as a stream of text parts (each with an optional per-part `voice` and `providerOptions`) and returns a stream of audio parts, plus `Experimental_`-prefixed stream option, text part, part, result, and usage types. The stable `SpeechModelV4` is unchanged.
