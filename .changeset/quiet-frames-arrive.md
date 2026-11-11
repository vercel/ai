---
'@ai-sdk/provider-utils': patch
---

Add an optional `onMessageBinary` callback to `connectToWebSocket` so providers can receive binary frames (e.g. raw audio) as bytes, in order with text frames.
