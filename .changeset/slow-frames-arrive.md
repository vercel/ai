---
'@ai-sdk/harness': patch
---

fix(harness): stop the sandbox channel heartbeat from terminating a connection that is still receiving data, which trapped large bridge events on slow links in a reconnect-and-replay loop
