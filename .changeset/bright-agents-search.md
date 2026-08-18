---
'@ai-sdk/perplexity': patch
---

feat(provider/perplexity): migrate language generation from the Sonar Chat Completions API to the Agent API. Legacy Sonar model IDs now select Agent API presets, which can change the underlying model, tools, cost, and latency. Sonar-only PDF input, image results, and related-question options now emit unsupported warnings.
