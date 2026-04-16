---
"@ai-sdk/amazon-bedrock": patch
---

fix(provider/amazon-bedrock): strip `fine-grained-tool-streaming-2025-05-14` beta for `claude-opus-4-7` on Bedrock. Bedrock's passthrough validation rejects this beta flag for Opus 4.7, causing streaming requests to fail with `invalid beta flag`. Other Claude models still receive the beta unchanged.
