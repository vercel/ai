---
'@ai-sdk/otel': patch
---

Record the `gen_ai.client.inference.duration` OpenTelemetry histogram in seconds for `generateText` and `streamText` model calls, including errors and cancellation, so configured metric exporters can report inference latency.
