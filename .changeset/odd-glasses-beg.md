---
'ai': patch
---

Add generated file telemetry output for `generateText` and `streamText` spans via `ai.response.files`, so text+file model responses are exported in the same generation event without requiring an additional model call.
