---
'@ai-sdk/gladia': patch
---

Align Gladia transcription provider options with the Gladia v2 OpenAPI spec: replace flat language options with `languageConfig`, add `piiRedaction` support, and remove request options no longer accepted by the pre-recorded init API. Also support selecting the transcription model (e.g. `solaria-1` or `solaria-3`) via `gladia.transcription(modelId)`.
