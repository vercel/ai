---
'@ai-sdk/google': patch
---

fix(provider/google): preserve nested empty object schemas in tool parameters to fix "property is not defined" validation errors when using required properties with empty object types
