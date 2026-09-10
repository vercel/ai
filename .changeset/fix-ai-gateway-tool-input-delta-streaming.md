---
'@ai-sdk/gateway': patch
---

fix(gateway): add Accept: text/event-stream header for streaming requests

Ensures the AI Gateway and any intermediate proxies recognize the request as an SSE stream, which can prevent buffering of tool input deltas for long string fields. Without this header, proxies may buffer the response before forwarding, causing delayed delivery of tool input deltas compared to direct provider connections.
