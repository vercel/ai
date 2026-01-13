---
"@ai-sdk/provider-utils": patch
"ai": patch
---

fix(provider-utils): improve tool type inference when using `inputExamples` with Zod schemas that use `.optional().default()` or `.refine()`.