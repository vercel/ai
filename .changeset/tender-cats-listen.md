---
'@ai-sdk/workflow': patch
---

fix(workflow): validate and normalize tool inputs with the original tool schema in `WorkflowAgent`, matching `streamText`. Defaults, transforms, coercion, refinements, unknown-key handling, custom validators, `repairToolCall`, and lifecycle callbacks now behave the same in durable runs, and approval requests retain the pre-transform input so transforms do not run twice on resume.
