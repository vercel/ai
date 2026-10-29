---
'@ai-sdk/provider-utils': patch
'@ai-sdk/anthropic': patch
'@ai-sdk/amazon-bedrock': patch
---

Add `defineModelCapabilities` and `getModelCapabilities` to define model capabilities as data next to the model IDs. The Anthropic and Amazon Bedrock providers now use them. Claude model IDs are matched exactly after removing snapshot dates and platform prefixes and suffixes, so IDs that only start with a known model ID (e.g. `claude-opus-4-60`) are treated as unknown models.
