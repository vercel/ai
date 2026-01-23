---
'@ai-sdk/amazon-bedrock': patch
---

Fix Cohere embedding model request format on Bedrock by sending the required `input_type` and parsing Cohere-style responses.
