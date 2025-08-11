---
'@ai-sdk/openai': patch
'@ai-sdk/azure': patch
---

feat(openai, azure): add configurable file ID prefixes for Responses API

- Added `fileIdPrefixes` option to OpenAI Responses API configuration
- Azure OpenAI now supports `assistant-` prefixed file IDs (replacing previous `file-` prefix support)
- OpenAI maintains backward compatibility with default `file-` prefix
- File ID detection is disabled when `fileIdPrefixes` is undefined, gracefully falling back to base64 processing
