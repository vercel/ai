---
"ai": patch
---

fix: invoke `toUIMessageStream` / `createUIMessageStream` `onError` only once per error

When `onEnd`/`onFinish` or step callbacks forced `handleUIMessageStreamFinish` to process the stream, `processUIMessageStream` re-reported every `error` chunk even though the callback had already run when the chunk was produced — so `onError` fired twice per upstream error, the second time with a re-wrapped `new Error(errorText)` instead of the original error. Error chunks flowing through the finish handler are no longer re-reported; failures thrown from the step callbacks themselves still surface through `onError`.
