---
'ai': patch
---

Cancel the caller's `audio` stream when `experimental_streamTranscribe` fails before or during streaming. Previously, when the model's `doStream` rejected before a stream existed (e.g. missing API key or other auth failure), the audio stream was never consumed or cancelled, so an upstream producer piping into it would hang forever.
