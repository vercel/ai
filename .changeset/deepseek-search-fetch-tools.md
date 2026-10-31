---
'@ai-sdk/gateway': patch
---

feat(provider/gateway): add DeepSeek Search and Fetch tools

Share lazy tool-error validation across DeepSeek, Parallel, and Tako while preserving additional error fields.

Tako tool errors also accept `gateway_rate_limit` and `unknown`; exhaustive error switches may need to handle these cases. Parallel and Tako errors gain optional `retryAfter` and `statusText` fields.
