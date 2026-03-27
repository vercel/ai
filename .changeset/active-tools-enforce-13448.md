---
'ai': patch
---

fix(ai): enforce `activeTools` at execution time to prevent inactive tool calls from running

When `activeTools` is specified, `generateText` and `streamText` previously only filtered tools sent to the model but still executed any tool call the model returned — even for tools not in `activeTools`. This could cause inactive tools to run when using mocked or unreliable models, or across agentic steps managed via `prepareStep`.

Tool calls for tools not present in the active set are now treated as `NoSuchToolError` (invalid) and are never executed.
