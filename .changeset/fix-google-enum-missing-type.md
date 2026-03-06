---
'@ai-sdk/google': patch
---

fix(google): infer `type` from enum values when not explicitly set

Gemini requires `type` alongside `enum` in response schemas. When Zod v4's
`z.enum()` generates `{ enum: ["foo", "bar"] }` without `type: "string"`, the
Gemini API rejects it with "enum: only allowed for STRING type". Now infers the
type from the enum values when not explicitly set.
