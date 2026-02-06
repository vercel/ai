---
'@ai-sdk/amazon-bedrock': patch
---

Remove misleading warning when mixing Anthropic provider-defined tools and standard function tools on Bedrock. The warning incorrectly stated that only Anthropic tools would be used, but both tool types are sent to Bedrock and work correctly together.
