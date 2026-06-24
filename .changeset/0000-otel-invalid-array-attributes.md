---
"@ai-sdk/otel": patch
---

Sanitize OpenTelemetry span array attributes so they no longer emit invalid OTLP values (arrays containing `undefined`/`null`/objects, or arrays mixing primitive types). Such values previously failed telemetry ingestion with `deserializing message invalid value: map, expected map with a single key` and flooded function logs with errors.
