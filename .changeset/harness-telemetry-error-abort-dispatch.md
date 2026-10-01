---
'@ai-sdk/harness': patch
---

fix(harness): dispatch telemetry `onError` with the turn's `callId`, and dispatch `onAbort` instead of `onError` when the caller's abort signal stops a turn
