---
'@ai-sdk/anthropic': patch
---

Migrated deprecated `output_format` parameter to `output_config.format` for structured outputs. This aligns with the current Anthropic API and fixes structured output support on Amazon Bedrock.
