---
'@ai-sdk/harness': patch
---

fix (harness): emit the message-level `start` part on HarnessAgent streams so `toUIMessageStream` persistence mode can inject the response message id
