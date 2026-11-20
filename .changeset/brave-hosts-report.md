---
"@ai-sdk/harness": patch
---

fix(harness): stream a host tool call that throws as a `tool-error` instead of a successful `tool-result` whose output is the error
