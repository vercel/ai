---
'@ai-sdk/sandbox-vercel': patch
---

Forward the `persistent` option when creating live sandboxes from template snapshots. Setting `persistent: false` now prevents unwanted automatic snapshots on stop, while explicit `true` and omitted options retain their existing behavior.
