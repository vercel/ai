---
'@ai-sdk/xai': patch
---

feat(xai): add missing responses API parameters and response metadata

- Add `parallelToolCalls` option to control parallel tool calling
- Add `promptCacheKey` option (sent as `x-grok-conv-id` header, returned in response)
- Add `reasoningSummary` option (`auto`, `concise`, `detailed`) merged into `reasoning` object alongside `reasoningEffort`
- Add `user` option for end-user identification
- Expose `safetyIdentifier`, `promptCacheKey`, `costInUsdTicks`, `costInNanoUsd`, and `serverSideToolUsageDetails` in `providerMetadata.xai` for both `doGenerate` and `doStream`
- Extend usage schema with `cost_in_usd_ticks`, `cost_in_nano_usd`, and `server_side_tool_usage_details` fields
- Extend response schema with `safety_identifier` and `prompt_cache_key` fields
