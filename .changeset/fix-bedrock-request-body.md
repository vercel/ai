---
'@ai-sdk/amazon-bedrock': patch
---

Expose the request body in `doGenerate` and `doStream` return values so callers can inspect the Bedrock Converse API payload that was sent.
