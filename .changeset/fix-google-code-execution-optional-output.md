---
'@ai-sdk/google': patch
---

fix(google): make `codeExecutionResult.output` optional in response schema

Gemini 3 Flash omits the `output` field in `codeExecutionResult` when code execution produces no text output (e.g., only saves files). The Zod response schema now accepts a missing `output` field and defaults it to an empty string.
