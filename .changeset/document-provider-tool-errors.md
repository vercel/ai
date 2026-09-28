---
'ai': patch
---

Clarify that provider-executed tool execution errors bypass the UI stream's `onError` callback to preserve provider error data and harness runtime messages. Stream errors and invalid tool calls still use the callback. Runtime behavior is unchanged.
