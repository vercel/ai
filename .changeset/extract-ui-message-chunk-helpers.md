---
'ai': patch
---

feat(stream-text): expose standalone UI message stream helpers and deprecate the equivalent `streamText` result methods.

The new `toUIMessageChunk` and `toUIMessageChunkStream` helpers let you convert a `streamText` `stream` (or any compatible `ReadableStream<TextStreamPart<TOOLS>>`) into UI message chunks without going through the result object — useful for custom transports, tests, and other producers of `TextStreamPart`.

The new `toUIMessageChunkStreamResponse` and `pipeTextStreamToUIMessageStreamResponse` helpers turn a `streamText` `stream` into a UI message stream response directly. This lets `result.toUIMessageStreamResponse(options)` and `result.pipeUIMessageStreamToResponse(response, options)` migrate to standalone helper calls with `stream: result.stream`.

`result.toUIMessageStream`, `result.toUIMessageStreamResponse`, `result.pipeUIMessageStreamToResponse`, `result.toTextStreamResponse`, and `result.pipeTextStreamToResponse` are now `@deprecated`. They still work in v7 and will be removed in the next major release. Migration snippets are in the v6 → v7 migration guide.
