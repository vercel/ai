---
'@ai-sdk/deepseek': patch
---

fix(provider/deepseek): align thinking mode options with the DeepSeek API. The `reasoningEffort` documentation claimed a server-side mapping that does not exist - DeepSeek V4 has three thinking strengths (`low`, `high`, `max`) and maps the compatibility values `medium` and `xhigh` to `high`. The top-level `reasoning` setting now maps `medium` to `high` instead of passing `medium` through, so the request reflects the effort the model actually applies, and the provider docs no longer tell you to select a model to turn thinking on.
