---
'@ai-sdk/amazon-bedrock': patch
---

Fix `createAmazonBedrock()` capturing `globalThis.fetch` at initialization time, which caused telemetry instrumentation (e.g. OpenTelemetry, Datadog) and other `globalThis.fetch` patches applied after provider creation to be silently ignored.
