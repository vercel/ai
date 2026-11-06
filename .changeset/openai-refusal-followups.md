---
'@ai-sdk/openai': patch
'@ai-sdk/openai-compatible': patch
---

fix(openai,openai-compatible): surface refusal logprobs and openai-compatible refusals

`@ai-sdk/openai`: Chat Completions responses that contain a refusal can return `logprobs.refusal` next to `logprobs.content`. The provider previously read only `logprobs.content`, so `providerMetadata.openai.logprobs` was empty or missing for refusals. Refusal logprobs are now included in emission order (content logprobs followed by refusal logprobs) in both `generateText` and `streamText`.

Streaming logprobs are now collected across all chunks in `streamText`: previously only the logprobs of the last streamed chunk were reported. This applies to content logprobs as well, so `providerMetadata.openai.logprobs` now contains the logprobs of every streamed token instead of only the last chunk's tokens. Explicitly empty logprobs (`logprobs: { content: [], refusal: null }`) are reported as an empty array, as before.

A refusal that arrives in the same streamed chunk as the `finish_reason` is now taken into account: such a response is reported with a `content-filter` finish reason instead of `stop`.

`@ai-sdk/openai-compatible`: Chat Completions responses that carry `message.refusal` (non-streaming) or `delta.refusal` (streaming) were ignored, so providers such as OpenAI served through `createOpenAICompatible` lost the refusal text and reported an empty `stop` response. Refusals are now returned as text content after any content text, and a non-empty refusal with a `stop` finish reason is reported as a `content-filter` finish reason. This also applies when the refusal and the finish reason arrive in the same streamed chunk. Non-string refusals (for example `refusal: false` from servers that use booleans) are ignored instead of failing the response.
