---
'ai': patch
---

Surface WebSocket close code and reason in realtime sessions

`BrowserRealtimeTransport` now forwards the close `code` and `reason` to `onClose`, and `AbstractRealtimeSession` reports abnormal closes (any code other than `1000`/`1005`) through `onError`, so a remote protocol kill (e.g. Gemini Live closing with `1007`) is no longer indistinguishable from a clean hangup.
