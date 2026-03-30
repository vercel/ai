---
'ai': patch
---

Fix crash when tools object contains null/undefined entries

`prepareToolsAndToolChoice` now skips null/undefined tool values instead of
throwing `TypeError: Cannot read properties of undefined (reading 'type')`.

This crash occurred when a provider tool factory result was accidentally spread
into the `tools` parameter (e.g., `tools: { ...anthropic.tools.webSearch_20260209({}) }`).
The factory returns a `Tool` object whose properties include `execute: undefined`,
`needsApproval: undefined`, etc. Spreading these into `tools` populated the record
with `undefined` values, causing the crash during stream processing.
