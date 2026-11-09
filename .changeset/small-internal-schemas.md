---
'ai': patch
'@ai-sdk/gateway': patch
'@ai-sdk/provider-utils': patch
---

Use Zod Mini for internal validation schemas to reduce bundle size while preserving the public message schemas' classic Zod methods, error messages, and compatibility with supported Zod 3 and Zod 4 versions.
