---
'ai': patch
'@ai-sdk/provider': patch
'@ai-sdk/openai': patch
'@ai-sdk/google-vertex': patch
'@ai-sdk/azure': patch
'@ai-sdk/xai': patch
---

Expose optional transcription word timings separately from segments and accept shared timestampGranularities. Explicit provider timing settings take precedence. OpenAI now sends timestamp_granularities only with verbose_json and warns when a requested timing is unavailable or excluded.
