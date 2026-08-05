---
'@ai-sdk/black-forest-labs': patch
---

Report the settled cost for FLUX 3 video generations. The submit response can only estimate, and returns no cost when the price depends on the finished video; the result endpoint answers with `SettledCostResultResponse`, whose cost was being dropped.
