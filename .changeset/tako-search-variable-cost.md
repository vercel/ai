---
'@ai-sdk/gateway': patch
---

feat(provider/gateway): add developer-only `variableCost`, `maxVariableCostUsd` and `extraBody` options to `takoSearch`, and type Tako placeholder cards, `relevance_score`, premium and variable-cost pricing fields, and `usage.variable_cost`. Mark `export_pricing.free_rows` as deprecated and optional; Tako always sends 0 and will stop sending it.
