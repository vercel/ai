---
'@ai-sdk/harness-opencode': patch
---

fix(harness-opencode): keep model limits from `openCodeConfig.provider` when the bridge configures the provider

A model's `limit` under `openCodeConfig.provider` was dropped whenever the bridge wrote its own provider entry for credentials, so a caller could not lower a model's input limit to make OpenCode compact earlier. The bridge now keeps `limit` for that provider's models. Other provider and model settings, such as options, headers, and the provider package, stay adapter-managed.
