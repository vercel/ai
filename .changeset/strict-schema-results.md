---
'@ai-sdk/provider-utils': patch
---

Fix validation of non-Zod Standard Schema results: a result that contains `issues` is now always treated as a failure, even when it also carries a `value`. Previously a failing schema such as Valibot's through `toStandardJsonSchema()` could be reported as valid, so rejected input, including tool input, was accepted.
