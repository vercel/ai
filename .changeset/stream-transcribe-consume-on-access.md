---
'ai': patch
---

`experimental_streamTranscribe` result promises now resolve without consuming `fullStream`: accessing any result promise consumes the stream internally. Previously `await result.text` alone deadlocked on transform backpressure. Because live transcription streams can be unbounded, `fullStream` is explicitly single-consumer (no replay buffering): access it once, before any result promise, when both stream parts and final results are needed.
