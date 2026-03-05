---
'@ai-sdk/google': patch
---

fix(provider/google): make `segment` optional in `groundingSupports` schema

Backport of #12002. When using image search grounding, the Google API returns `groundingSupports` entries without a `segment` field, causing schema validation to fail with "Invalid JSON response".
