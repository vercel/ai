---
'@ai-sdk/code-mode': patch
---

feat(code-mode): add `executionPolicy.cpuTimeoutMs` to bound CPU time spent running sandboxed code, and throw `CodeModeCpuTimeoutError` when it is exceeded
