---
'@ai-sdk/anthropic': patch
---

Keep retrieved web-search sources separate from normalized inline citations on text parts and text-end events. Preserve every supported web and document citation kind in generation, streaming, and batch results, with typed AnthropicCitation and AnthropicTextProviderMetadata exports. Retain document source compatibility and web citation source fallbacks when retrieval results are unavailable.
