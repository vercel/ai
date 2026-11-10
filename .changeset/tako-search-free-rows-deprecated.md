---
'@ai-sdk/gateway': patch
---

fix(provider/gateway): restore `export_pricing.free_rows` on `takoSearch` results as a deprecated optional field, so code that reads it compiles again. Tako always sends 0 and will stop sending it.
