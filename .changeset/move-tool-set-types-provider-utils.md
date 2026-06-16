---
'ai': patch
'@ai-sdk/provider-utils': patch
---

fix(types): move shared tool set utility types into provider-utils

Moved `ToolSet`, `InferToolSetContext`, and `UnionToIntersection` into `@ai-sdk/provider-utils` and updated `ai` internals to import them directly from there. This keeps the shared tool typing utilities colocated with the core tool type definitions.
