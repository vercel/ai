---
'@ai-sdk/provider-utils': patch
'@ai-sdk/openai': patch
'@ai-sdk/azure': patch
'@ai-sdk/google': patch
'@ai-sdk/google-vertex': patch
'@ai-sdk/anthropic': patch
'@ai-sdk/amazon-bedrock': patch
---

Resolve hosted provider option aliases per field before validation and defaults, with explicit adapter namespaces. Accept OpenAI-backed Azure options under `azure`, including transcription language hints, while preserving `openai` compatibility and existing metadata keys. Keep replay metadata groups intact and expose shared audio and image options in Azure's provider option definitions.
