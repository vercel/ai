---
'@ai-sdk/workflow': patch
---

`WorkflowAgent` now mirrors core (`generateText`/`streamText`) by only feeding back error results for `dynamic` invalid tool calls. Non-dynamic (statically-typed) invalid tool calls are silently dropped, matching the `invalid && dynamic` gate in `generate-text.ts`.
