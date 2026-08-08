---
'@ai-sdk/google': patch
---

fix (provider/google): handle non-string enum and const values in schemas. The Gemini API only allows enum on string types, so string enums without an explicit type now get `type: 'string'`, non-string enum/const values are moved into the description while preserving the declared type, and null enum/const values are expressed via `nullable`.
