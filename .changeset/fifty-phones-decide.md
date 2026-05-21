---
"@ai-sdk/amazon-bedrock": patch
---

fix(provider/amazon-bedrock): mark `input` optional on tool-use schema so streaming `contentBlockStart` events parse under Zod >= 4.4.0
