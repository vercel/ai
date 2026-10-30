---
'@ai-sdk/harness-opencode': patch
---

Send a tool call to the host before its approval request. OpenCode asks for permission while the call is still pending and reports it as running only afterwards, so with `allow-reads` or `allow-edits` the approval request reached `HarnessAgent` first and the turn failed with "emitted approval request ... for unknown tool call".
