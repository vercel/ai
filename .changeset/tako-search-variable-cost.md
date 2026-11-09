---
'@ai-sdk/gateway': patch
---

feat(provider/gateway): add developer-only `variableCost`, `maxVariableCostUsd` and `extraBody` options to `takoSearch`, and type Tako placeholder cards, `relevance_score`, premium and variable-cost pricing fields, and `usage.variable_cost`. Remove the deprecated `export_pricing.free_rows` from the published types and schema; Tako always sends 0 and will drop it. Code that reads it must be updated, though the value still passes through at runtime while Tako sends it.
