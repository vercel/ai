---
'@ai-sdk/provider-utils': patch
'@ai-sdk/openai': patch
'@ai-sdk/openai-compatible': patch
'@ai-sdk/groq': patch
'@ai-sdk/deepseek': patch
'@ai-sdk/alibaba': patch
---

Fix `StreamingToolCallTracker` finalizing streaming tool calls on parsable partial JSON. Tool calls now only finalize during stream flush, restoring the behavior of #13137: a parsable argument buffer can still be the prefix of a longer argument string, so finalizing early could act on truncated tool inputs.
