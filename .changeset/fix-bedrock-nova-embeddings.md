---
'@ai-sdk/amazon-bedrock': patch
---

fix(provider/amazon-bedrock): support Nova embeddings request schema

Nova embedding models now send a `messages`-based payload (instead of `inputText`). Passing `dimensions` or `normalize` for Nova embedding models is ignored with warnings.
