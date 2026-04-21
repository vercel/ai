---
"ai": patch
---

feat(stream-text): deprecate `toUIMessageStream`, `toUIMessageStreamResponse`, `pipeUIMessageStreamToResponse`, `toTextStreamResponse`, and `pipeTextStreamToResponse` instance methods on the `streamText` result. Use the standalone helpers `toUIMessageChunkStream`, `handleUIMessageStreamFinish`, `createUIMessageStreamResponse`, `pipeUIMessageStreamToResponse`, `createTextStreamResponse`, and `pipeTextStreamToResponse` instead. The existing methods keep working in v7 and will be removed in the next major release.
