---
'@ai-sdk/react': patch
---

Fix `useChat` throttling so unrelated React renders cannot publish message snapshots ahead of the configured throttle cadence.
