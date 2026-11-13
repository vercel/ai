---
'@ai-sdk/workflow': patch
---

fix(workflow): call the `onInputAvailable` tool hook in `stream()` when the provider sends a tool call without streaming its input first.
