---
'@ai-sdk/openai-compatible': patch
---

fix(openai-compatible): send null instead of empty string for assistant messages with only tool calls

When assistant messages contain only tool-call parts and no text parts, the content field was being sent as an empty string ("") instead of null. This caused AWS Bedrock to reject the request with a ValidationException.

The fix changes `content: text` to `content: text || null` so that empty text content is sent as null, which matches the OpenAI API spec and is accepted by Bedrock.
