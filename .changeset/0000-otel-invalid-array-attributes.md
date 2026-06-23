---
"ai": patch
---

Sanitize OpenTelemetry array attributes so spans no longer emit invalid OTLP values (arrays containing `undefined`/`null`/objects, or arrays mixing primitive types). For example, `gen_ai.response.finish_reasons` could be emitted as `[undefined]` when a finish reason was missing. Such values previously failed telemetry ingestion with `deserializing message invalid value: map, expected map with a single key` and flooded function logs with errors.
