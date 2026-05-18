---
'ai': patch
---

feat(stream-text): expose standalone `toUIMessageChunk` and `toUIMessageChunkStream` helpers, and deprecate the equivalent instance methods on the `streamText` result.

The new helpers let you convert a `streamText` `fullStream` (or any compatible `ReadableStream<TextStreamPart<TOOLS>>`) into UI message chunks without going through the result object — useful for custom transports, tests, and other producers of `TextStreamPart`.

`pipeUIMessageStreamToResponse` now also accepts `streamText` `fullStream` streams directly, so `result.pipeUIMessageStreamToResponse(response, options)` can be migrated to a single standalone helper call.

`result.toUIMessageStream`, `result.toUIMessageStreamResponse`, `result.pipeUIMessageStreamToResponse`, `result.toTextStreamResponse`, and `result.pipeTextStreamToResponse` are now `@deprecated`. They still work in v7 and will be removed in the next major release. Migration snippets are in the v6 → v7 migration guide.
