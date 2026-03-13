---
'ai': patch
---

Stabilize `include` setting: rename `experimental_include` to `include` and flip defaults to `false` for both `requestBody` and `responseBody`. This reduces memory usage by default when processing large payloads like images. To opt in to including bodies, set `include: { requestBody: true, responseBody: true }`.
