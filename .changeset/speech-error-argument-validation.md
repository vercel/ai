---
'ai': patch
'@ai-sdk/test-server': patch
'@ai-sdk/mcp': patch
'@ai-sdk/huggingface': patch
'@ai-sdk/baseten': patch
---

refactor(speech): throw InvalidArgumentError instead of a generic Error when the audio format is not determinable from the mediaType.

fix(clean): replace platform-specific rm -rf clean commands with cross-platform del-cli to fix dev builds on Windows.
