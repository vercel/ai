---
'@ai-sdk/provider-utils': patch
---

fix(provider-utils): limit the size of a single server-sent event

`parseJsonEventStream` and `createEventSourceResponseHandler` buffered an event until it was complete, without a limit. A streaming response that never completed an event could exhaust the memory and crash the process. A single event is now limited to 67,108,864 characters (64 MiB of ASCII text). A stream that exceeds the limit fails with an error and the response body is cancelled.

The limit also applies to the streams that `useChat` and `useCompletion` read. `parseJsonEventStream` has a new `maxEventSize` option to change it.
