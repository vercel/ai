---
'@ai-sdk/provider-utils': patch
---

Stop waiting for WebSocket backpressure polling as soon as its signal aborts,
including in runtimes without a global `DOMException` constructor.
