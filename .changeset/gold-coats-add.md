---
'@ai-sdk/gateway': patch
---

To solve the issue of the gateway backend returning usage in the flat v2 shape, we convert that usage into the v3 structure before returning. We add tests to ensure correct output.
