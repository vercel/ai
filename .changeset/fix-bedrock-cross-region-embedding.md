---
'@ai-sdk/amazon-bedrock': patch
---

fix(amazon-bedrock): support cross-region inference prefixes for embedding models

Embedding model family detection (Nova vs Cohere vs Titan) used `startsWith()` which
failed for cross-region model IDs like `eu.cohere.embed-v4:0` or `us.amazon.nova-embed-v1:0`.
Now strips AWS cross-region inference prefixes before checking the model family.
