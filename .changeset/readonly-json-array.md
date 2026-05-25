---
"@ai-sdk/provider": patch
"ai": patch
---

Made `JSONArray` type readonly to accept `readonly` arrays. This fixes type compatibility when tool call results contain readonly arrays (e.g., from `as const` assertions). Mutable arrays remain assignable since `T[]` extends `readonly T[]`.

Updated `generate-image.ts` to use spread concat instead of `.push()` for readonly-safe array building.
