---
'@ai-sdk/amazon-bedrock': patch
'@ai-sdk/anthropic': patch
---

Migrated deprecated `output_format` parameter to `output_config.format` for structured outputs + Enabled native structured output support for Bedrock Anthropic models via `output_config.format`.
