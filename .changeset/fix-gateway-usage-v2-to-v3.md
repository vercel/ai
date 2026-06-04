---
'@ai-sdk/gateway': patch
---

fix(gateway): normalize V2 flat usage to V3 nested format

The gateway backend returns usage as flat numbers (V2 format — `inputTokens`,
`outputTokens`, `reasoningTokens`, `cachedInputTokens`) even when the
spec-version header is set to 3. Because `GatewayLanguageModel` declares
`specificationVersion = "v3"`, the SDK's `asLanguageModelV3` wrapper skips
the V2→V3 conversion, resulting in `usage.inputTokens.total` always being
`undefined` for consumers of `ai@6`.

The fix adds a `normalizeUsageToV3` helper that detects V2 flat-number usage
and converts it to the V3 nested `{ inputTokens: { total, cacheRead, … },
outputTokens: { total, reasoning, … } }` shape. It is applied in both
`doGenerate` and the `finish` stream part in `doStream`.

Fixes #12771
