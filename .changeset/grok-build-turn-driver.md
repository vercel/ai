---
'@ai-sdk/harness-grok-build': patch
---

feat(harness-grok-build): implement bridge turn driver and doStart

The grok-build harness now runs a real turn end-to-end: it spawns the `grok` CLI inside the sandbox with `--output-format streaming-json --always-approve`, streams stdout through `mapStreamLine`, and emits `HarnessV1StreamPart` events. Adds `toGrokCliEnv` to map resolved auth onto the CLI's real env vars (direct `XAI_API_KEY` vs gateway `GROK_CODE_XAI_API_KEY` + `GROK_MODELS_BASE_URL`) and a `createSession` implementation covering prompt/continue turns, detach/stop/suspend lifecycle, and destroy.
