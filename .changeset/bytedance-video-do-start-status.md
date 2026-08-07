---
'@ai-sdk/bytedance': patch
---

feat (provider/bytedance): implement async video operations (doStart/doStatus) on the video model, replacing the internal doGenerate polling loop.

Polling is now orchestrated by `generateVideo` via its `poll: { intervalMs, timeoutMs }` option. The `pollIntervalMs` and `pollTimeoutMs` provider options are deprecated and ignored; passing either emits a warning. The polling defaults change accordingly (interval 3000ms to 5000ms, timeout 300000ms to 600000ms), and a failed or cancelled task now rejects with a plain `Error` rather than an `AISDKError`. Failure reasons reported by the task are now included in the error message.
