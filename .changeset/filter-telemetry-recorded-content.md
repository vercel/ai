---
'ai': patch
---

Respect `recordInputs` and `recordOutputs` when delivering telemetry events to integrations and the `ai:telemetry` channel. Filter nested content and omit raw span results when content recording is disabled, while preserving application results.
