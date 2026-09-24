---
'@ai-sdk/cohere': patch
---

Add support for configurable `embeddingTypes` in Cohere embedding models.

Previously, the Cohere provider hard-coded `embedding_types` to `["float"]` and incorrectly stated that Cohere did not support other embedding formats. This change exposes an `embeddingTypes` option, allowing users to request alternative embedding representations such as `int8`, `uint8`, `binary`, `ubinary`, and `base64`, in line with the Cohere API.
