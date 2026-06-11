---
'ai': patch
---

feat(stream-text): expose standalone stream transformation helpers and deprecate the equivalent `streamText` result methods.

The new `toUIMessageChunk` and `toUIMessageStream` helpers let you convert a `streamText` `stream` (or any compatible `ReadableStream<TextStreamPart<TOOLS>>`) into UI message chunks without going through the result object — useful for custom transports, tests, and other producers of `TextStreamPart`.

`result.toUIMessageStreamResponse(options)` and `result.pipeUIMessageStreamToResponse(response, options)` can migrate by passing `toUIMessageStream({ stream: result.stream, ...options })` to `createUIMessageStreamResponse` or `pipeUIMessageStreamToResponse`.

The new `toTextStream` helper extracts text deltas from a `streamText` `stream`, so `result.toTextStreamResponse(options)` and `result.pipeTextStreamToResponse(response, options)` can migrate to `createTextStreamResponse({ stream: toTextStream({ stream: result.stream }), ...options })` and `pipeTextStreamToResponse({ response, stream: toTextStream({ stream: result.stream }), ...options })`.

`result.toUIMessageStream`, `result.toUIMessageStreamResponse`, `result.pipeUIMessageStreamToResponse`, `result.toTextStreamResponse`, and `result.pipeTextStreamToResponse` are now `@deprecated`. They still work in v7 and will be removed in the next major release. Migration snippets are in the v6 → v7 migration guide.
