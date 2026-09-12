---
'@ai-sdk/provider-utils': patch
---

perf: validate provably-synchronous zod v4 schemas through compiled clones

When the installed zod exposes ahead-of-time compilation (zod >= 4.5),
`zodSchema()` classifies each v4 schema once via `compile(schema, { strict:
true })`: success proves the schema contains no async refinements, transforms,
or pipes, and validation then runs synchronously through the compiled clone
(no per-validation promise, eligible for zod's compiled fast path — up to
3-9x faster parsing on union-heavy schemas such as provider stream chunks).
Schemas with async constructs, unsupported constructs, or older zod versions
keep the existing `safeParseAsync` behavior unchanged.
