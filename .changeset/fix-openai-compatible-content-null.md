---
'@ai-sdk/openai-compatible': patch
---

fix(openai-compatible): send null content for assistant messages with only tool calls

The @ai-sdk/openai-compatible provider was sending content: "" for assistant messages that contain only tool calls. This caused Bedrock's ValidationException because Bedrock requires content to be null when only tool calls are present.
