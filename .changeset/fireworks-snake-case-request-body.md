---
'@ai-sdk/fireworks': patch
---

Send `promptCacheKey`, `serviceTier`, `reasoningHistory` and `thinking.budgetTokens` under the snake_case names the Fireworks API defines. Fireworks rejects unknown fields outright, so previously any of these provider options failed the whole request with `400 Extra inputs are not permitted`.
