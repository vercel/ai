---
'@ai-sdk/gateway': patch
---

Add marketCost, surchargeCost, and gatewayCost fields to getGenerationInfo() results, surfacing the corresponding fields from the AI Gateway generation lookup API.

The cost breakdown fields are optional and omitted when unavailable, preserving compatibility with older responses and distinguishing missing data from a zero cost.
