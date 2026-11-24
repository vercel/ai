---
'@ai-sdk/provider-utils': patch
'@ai-sdk/gateway': patch
---

fix(provider-utils): limit the size of a single server-sent event

`parseJsonEventStream` and `createEventSourceResponseHandler` buffered an event until it was complete, without a limit. A streaming response that never completed an event could exhaust the memory and crash the process. A single event is now limited to 64 MiB. A stream that exceeds the limit fails with an error and the response body is cancelled.

The limit also applies to the streams that `useChat` and `useCompletion` read. `parseJsonEventStream` has a new `maxEventSize` option to change it. The gateway video model uses it to accept a result event of up to 512 MiB, because that event contains the generated videos.
