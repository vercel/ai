---
'@ai-sdk/harness-claude-code': patch
'@ai-sdk/workflow-harness': patch
'@ai-sdk/harness': patch
---

feat(harness): stream tool input as the model writes it

Adds `tool-input-start`, `tool-input-delta` and `tool-input-end` to
`HarnessV1StreamPart` and the bridge outbound union, and emits them from the
Claude Code adapter while a tool call's input JSON is being written. The
settled `tool-call` still follows under the same tool call id.

These are new members of two public discriminated unions, so a consumer that
switches exhaustively over `HarnessV1StreamPart` (or validates bridge frames
against its own allowlist) will see variants it did not before.
