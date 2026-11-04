---
"ai": patch
---

fix(ai): infer union output types when passing a union of schemas to `Output.object` and `Output.array`

Previously, passing a schema whose type is a union of schemas (e.g. a schema selected from a map at runtime) failed to type-check because the output type was inferred from the first union member only. The output type is now inferred as the union of the schemas' output types.
