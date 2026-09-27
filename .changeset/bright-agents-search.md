---
'@ai-sdk/perplexity': minor
---

BREAKING: Migrate language generation from the Sonar Chat Completions API (supported by Perplexity only until September 27, 2026) to the Agent API. Replace Sonar model IDs and provider options with Agent API presets, models, and tools. The new API changes request and response metadata, raw stream events, usage and cost data, and does not support Sonar PDF input or image and video results. Reasoning effort is configured through `providerOptions.perplexity.reasoning`. Agent API stream events with `null` fields are accepted.
