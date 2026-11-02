---
'@ai-sdk/amazon-bedrock': patch
'@ai-sdk/anthropic': patch
---

Enable native structured output and strict tools for supported Claude 5 models on Bedrock. In automatic mode, Bedrock and Anthropic now fall back for schemas that native structured output cannot represent: recursive references, open objects, or more than ten optional properties. Anthropic uses the JSON response tool; Bedrock Converse uses the JSON tool or JSON instructions for models that reject forced tool use. Explicit `outputFormat` selection remains unchanged.
