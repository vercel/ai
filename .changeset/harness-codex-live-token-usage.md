---
'@ai-sdk/harness-codex': patch
'@ai-sdk/harness': patch
---

fix(harness-codex): count sub-agent token usage and report it while a turn runs, so an aborted or failed turn keeps what it consumed (running total as a `raw` part `{ type: 'codex-token-usage', turnId, usage }`; `finish-step` carries real usage instead of zero). fix(harness): `raw` parts no longer open a step or get swallowed by a stop condition; stop conditions report all steps' usage to telemetry.
