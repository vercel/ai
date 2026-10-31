---
'@ai-sdk/workflow': patch
---

feat(workflow): remove `experimental_transform` from `WorkflowAgent`

The option ran once per model step, on raw provider stream parts, so it could not transform the agent's stream as a whole, and its semantics differed from `streamText`'s `experimental_transform`. Oversized stream parts, its one practical use, are now handled by WorkflowAgent directly. To transform provider stream parts, wrap the model with `wrapLanguageModel` and a `wrapStream` middleware instead.
