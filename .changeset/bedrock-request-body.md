---
"@ai-sdk/amazon-bedrock": patch
---

fix(amazon-bedrock): return `request.body` from `doGenerate` and `doStream`. Previously the Bedrock provider never populated the `request` field, so observability/tracing tools received `undefined` instead of the Converse API request payload.
