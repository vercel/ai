---
'@ai-sdk/provider-utils': patch
---

fix(provider-utils): load Node built-ins without dynamic evaluation

`safeNodeFetch` constructed its Node 18 fallback importer with
`Function('specifier', 'return import(specifier)')`. Next.js statically rejects
dynamic evaluation in the Edge Runtime, so any bundle reaching
`fetchWithValidatedRedirects` or `downloadBlob` from an edge route failed to
compile with "Dynamic Code Evaluation ... not allowed in Edge Runtime".

Node built-ins are now loaded through `process.getBuiltinModule` only, matching
the v7 implementation. This keeps the Metro fix from the previous release — the
distributed module still contains no `import()` expression to parse — while
leaving nothing for the Edge Runtime scanner to reject.

Because the fallback is gone, `getDefaultDownloadFetch` requires
`process.getBuiltinModule` (Node 20.16+) and the `@ai-sdk/provider-utils`
engines range moves from `>=18` to `>=20.16`. Node 18 is past end of life.
