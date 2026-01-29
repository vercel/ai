---
'@ai-sdk/cohere': patch
'@ai-sdk/amazon-bedrock': patch
---

Add `outputDimension` option for Cohere embedding models to control the size of the output embedding vector (256, 512, 1024, or 1536).

Unify Bedrock embedding dimension options into a single `dimensions` parameter that maps to the correct API field based on model family (Titan, Nova, or Cohere).
