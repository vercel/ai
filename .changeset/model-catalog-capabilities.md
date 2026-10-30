---
'@ai-sdk/provider': patch
'@ai-sdk/provider-utils': patch
'@ai-sdk/openai': patch
'@ai-sdk/anthropic': patch
'@ai-sdk/google': patch
'@ai-sdk/amazon-bedrock': patch
---

refactor(provider-utils): define OpenAI, Anthropic, and Google model capabilities as model catalog data

Model-specific behavior now comes from catalogs defined with `defineModelCatalog` and read with `getModelCapabilities` from `@ai-sdk/provider-utils`. Catalogs match exact model IDs before model families, and give unknown models broad support instead of rejecting features.

- Removes the `ModelCapabilities`, `ModelCapability`, `ModelEntry`, `ModelProviderOptions`, `ProviderOptionDefinition`, and `ProviderOptionDefinitions` types from `@ai-sdk/provider`.
- Unknown OpenAI models: reasoning options, service tiers, async tools, reasoning effort updates, and streaming transcription are sent as requested instead of being dropped with a warning.
- Unknown Google models: provider-defined tools are sent instead of being dropped with a warning.
- OpenAI fine-tuned models (`ft:<model>:...`) and dated snapshots resolve like their base model.
- Prefixed Gemma model IDs such as `models/gemma-3-27b-it` send system messages as user content like unprefixed Gemma model IDs.
- Unsupported feature warnings name the model instead of model families.
