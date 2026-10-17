---
'@ai-sdk/sandbox-vercel': patch
---

Snapshot a sandbox template created from a snapshot source. The template used to treat the source snapshot as its own, so it was never stopped or snapshotted, its sandbox kept running, and live sandboxes started without the template's preparation.
