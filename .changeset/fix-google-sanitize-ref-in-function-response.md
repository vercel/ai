---
"@ai-sdk/google": patch
---

fix(provider/google): strip $ref and $defs from tool response content to prevent Gemini 400 errors

Stripping $ref and $defs unconditionally means that a tool response containing a literal field named $ref or $defs (e.g., a MongoDB DBRef-shaped object) will also have that field removed; this is an accepted tradeoff since resolving $ref/$defs inline is impractical for the recursive schemas z.lazy() produces.
