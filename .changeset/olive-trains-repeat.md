---
'@ai-sdk/amazon-bedrock': patch
---

fix(amazon-bedrock): rename thinking block binding field for Bedrock

Bedrock names the thinking block binding field `mismatch_behavior`, while the Anthropic Messages API names it `prefix_mismatch_behavior`. The Bedrock Anthropic provider forwarded the Anthropic spelling unchanged, so any request setting `thinking.blockBinding.prefixMismatchBehavior` failed with `thinking.adaptive.block_binding.prefix_mismatch_behavior: Extra inputs are not permitted`.
