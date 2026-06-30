---
"@ai-sdk/amazon-bedrock": patch
---

fix (amazon-bedrock): send the correct `bedrockRerankingConfiguration` request key for reranking

The Bedrock Agent Runtime `Rerank` API requires the request member to be named `bedrockRerankingConfiguration`. A consistency rename had changed it to `amazonBedrockRerankingConfiguration`, causing AWS to reject every reranking call with `Value null at 'rerankingConfiguration.bedrockRerankingConfiguration' failed to satisfy constraint: Member must not be null` (HTTP 400). The wire key is now restored to match the AWS contract.
