---
'@ai-sdk/openai': patch
'@ai-sdk/openai-compatible': patch
'@ai-sdk/groq': patch
'@ai-sdk/deepseek': patch
'@ai-sdk/alibaba': patch
---

fix(security): prevent streaming tool calls from finalizing on parsable partial JSON

Streaming tool call arguments were finalized using `isParsableJson()` as a heuristic for completion. If partial accumulated JSON happened to be valid JSON before all chunks arrived, the tool call would be executed with incomplete arguments. Tool call finalization now only occurs in `flush()` after the stream is fully consumed.
