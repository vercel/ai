---
'@ai-sdk/workflow': patch
---

fix(workflow): pass URL-backed inputs through workflow functions before model steps

URL-backed image and file inputs are no longer downloaded in the workflow context, where `fetch` is unavailable. Model steps now download unsupported URLs using the resolved model's `supportedUrls`, for both `stream()` and `generate()`.

A custom `experimental_download` function now runs inside the model step instead of the workflow context. Mark it with `'use step'` so it can be passed to the step (as with `repairToolCall`).
