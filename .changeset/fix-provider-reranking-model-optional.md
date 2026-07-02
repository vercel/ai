---
'ai': patch
---

fix(ai): make `rerankingModel` optional in `Provider` type

The `Provider` type exported from the `ai` package had `rerankingModel` as a required method, but `ProviderV3` and `ProviderV4` in `@ai-sdk/provider` both declare it as optional (`?`). This inconsistency caused type errors when assigning a `ProviderV3` or `ProviderV4` implementation to a `Provider`-typed variable.
