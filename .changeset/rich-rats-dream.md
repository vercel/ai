---
'ai': patch
---

Added empty string check for better telemetry handling from Open AI/Azure results. The Azure provider seems to not include both the `modelId` or `id` in the chunk object. This causes the model to not be populated in Langfuse when using the `experimental_telemetry` property in `streamtext`. Realted to Langfuse issue [#5286](https://github.com/langfuse/langfuse/issues/5286).
