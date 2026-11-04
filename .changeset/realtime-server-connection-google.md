---
'@ai-sdk/google': patch
---

feat (provider/google): implement server-side realtime extensions

`GoogleRealtimeModel` supports the existing `getServerWebSocketConfig()` contract, returning the unconstrained Gemini Live endpoint with resolved credential headers. Each server connection can create its own event parser. Reported gross token totals and available modality counts are normalized without guessing missing values. Usage in a completion frame is attached to `response-done`; other snapshots use `custom` events with `rawType: 'usageMetadata'` and typed `usage`, preserving lifecycle ordering without inferring response associations.
