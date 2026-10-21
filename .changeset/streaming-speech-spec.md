---
'@ai-sdk/provider': patch
---

feat(provider): add experimental streaming speech to SpeechModelV4

Adds an optional `SpeechModelV4.doStream()` that takes the input text as a stream of text deltas and returns a stream of audio parts, plus `Experimental_`-prefixed stream option, part, result, and usage types.
