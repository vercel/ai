---
'@ai-sdk/amazon-bedrock': patch
---

feat (provider/amazon-bedrock): add `structuredOutputMode` provider option

Adds a `structuredOutputMode` option (`'auto' | 'jsonTool' | 'outputFormat'`, default `'auto'`), mirroring the `@ai-sdk/anthropic` provider. Set it to `'jsonTool'` to force the tool-based JSON path for object generation on Bedrock partitions/regions that reject Anthropic's native `output_config.format` — e.g. AWS GovCloud, where the request otherwise fails with `output_config.format: Extra inputs are not permitted`. Default behavior is unchanged.
