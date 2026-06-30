---
'@ai-sdk/assemblyai': patch
---

fix(assemblyai): report transcription segment timings in seconds

AssemblyAI returns word timings in milliseconds, but the provider placed them
directly into the `startSecond`/`endSecond` fields of `transcribe` segments (and
into the `durationInSeconds` fallback), so segment timings were off by 1000×.
The provider now converts milliseconds to seconds.
