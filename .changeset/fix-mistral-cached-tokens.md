---
'@ai-sdk/mistral': patch
---

Map cached token counts from Mistral API usage response. Previously all prompt tokens were reported as noCacheTokens, ignoring the `num_cached_tokens`, `prompt_tokens_details.cached_tokens`, and `prompt_token_details.cached_tokens` fields returned by Mistral.
