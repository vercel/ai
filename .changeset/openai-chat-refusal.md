---
'@ai-sdk/openai': patch
---

fix(openai): surface Chat Completions refusals as text content

The Chat Completions model ignored `message.refusal` (non-streaming) and `delta.refusal` (streaming). When the model refused to answer, `content` was `null`, so the AI SDK returned empty text with a `stop` finish reason and silently dropped the refusal. Refusal text is now emitted as text content in both `generateText` and `streamText` results, and it is emitted in addition to content when the API returns both. A refusal with a `stop` finish reason is now reported as a `content-filter` finish reason, matching the Anthropic provider and the Responses API.
