---
'@ai-sdk/google': patch
---

fix(google): keep empty arrays and objects in tool-call input streamed with `streamFunctionCallArguments`

Vertex sends a value-less `partialArgs` entry for an empty container (e.g. `$.tags[]`), which was dropped, so `[]` and `{}` arguments went missing from the streamed tool-call input.
