---
'@ai-sdk/amazon-bedrock': patch
---

fix(provider/amazon-bedrock): omit tool `strict` and `output_config.format` for Claude models Bedrock rejects them on
