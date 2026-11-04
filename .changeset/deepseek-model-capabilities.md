---
'@ai-sdk/deepseek': patch
---

Centralize DeepSeek model capabilities and endpoint policies in a shared catalog, preserving request behavior and generating the model capability table from the catalog.

Preserve unspecified strict-tool support for endpoints such as Azure, allowing strict tools through while retaining explicit endpoint restrictions.
