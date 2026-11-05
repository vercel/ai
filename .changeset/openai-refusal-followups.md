---
'@ai-sdk/openai': patch
'@ai-sdk/openai-compatible': patch
---

fix(openai,openai-compatible): surface refusal logprobs and openai-compatible refusals

`@ai-sdk/openai`: Chat Completions responses that contain a refusal can return `logprobs.refusal` next to `logprobs.content`. The provider previously read only `logprobs.content`, so `providerMetadata.openai.logprobs` was empty or missing for refusals. Refusal logprobs are now included in emission order (content logprobs followed by refusal logprobs) in both `generateText` and `streamText`. Logprobs for responses without a refusal are unchanged.

`@ai-sdk/openai-compatible`: Chat Completions responses that carry `message.refusal` (non-streaming) or `delta.refusal` (streaming) were ignored, so providers such as OpenAI served through `createOpenAICompatible` lost the refusal text and reported an empty `stop` response. Refusals are now returned as text content after any content text, and a non-empty refusal with a `stop` finish reason is reported as a `content-filter` finish reason.
