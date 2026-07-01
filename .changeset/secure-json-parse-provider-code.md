---
'@ai-sdk/provider-utils': patch
'@ai-sdk/anthropic': patch
'@ai-sdk/google': patch
'@ai-sdk/gateway': patch
---

fix(providers): use `secureJsonParse` instead of raw `JSON.parse` in production code

Several provider files parsed untrusted strings (tool call inputs, tool error results, and API error response bodies) with raw `JSON.parse`, leaving a prototype-pollution vector open. `secureJsonParse` (which rejects `__proto__` / `constructor.prototype` keys) is now exported from `@ai-sdk/provider-utils` and used at these call sites in `@ai-sdk/google`, `@ai-sdk/anthropic`, and `@ai-sdk/gateway`.
