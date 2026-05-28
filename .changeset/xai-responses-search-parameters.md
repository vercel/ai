---
'@ai-sdk/xai': patch
---

Support `searchParameters` (xAI Live Search) on the Responses API, matching the Chat Completions model. Previously `providerOptions.xai.searchParameters` was silently dropped on `xai.responses(...)` because the Responses options schema and request body didn't handle it. When set, `search_parameters` is now serialized to the `/v1/responses` request and overrides the `web_search` provider tool, consistent with xAI's API.
