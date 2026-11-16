---
'@ai-sdk/groq': patch
'@ai-sdk/deepseek': patch
'@ai-sdk/alibaba': patch
---

Prevent streaming tool calls from finalizing on parsable partial JSON. A tool call was treated as complete as soon as its accumulated arguments parsed as JSON, so a stream that sent valid JSON early and more argument text in later deltas ran the tool with truncated arguments. Tool calls are now finalized when the stream ends.
