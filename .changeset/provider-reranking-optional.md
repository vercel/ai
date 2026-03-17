---
'ai': patch
---

Make `rerankingModel` optional on the `Provider` type to match `ProviderV3`, fixing type errors when assigning provider implementations that don't support reranking.
