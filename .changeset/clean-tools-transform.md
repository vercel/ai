---
'ai': patch
'@ai-sdk/provider-utils': patch
---

fix(ai): execute manually approved tool inputs produced by schema transforms

Preserve approved inputs during revalidation and reject histories whose reconstructed schema output differs, including signed approvals with missing original input. Validate transformed UI tool inputs against the reconstructed output before returning them as static tool parts.
