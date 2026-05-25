---
"@ai-sdk/provider": patch
---

Made `JSONArray` type readonly to accept `readonly` arrays. This fixes type compatibility when tool call results contain readonly arrays (e.g., from `as const` assertions). Mutable arrays remain assignable since `T[]` extends `readonly T[]`.
