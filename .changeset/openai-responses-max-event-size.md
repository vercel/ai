---
'@ai-sdk/provider-utils': patch
'@ai-sdk/openai': patch
'@ai-sdk/xai': patch
---

fix(openai, xai): accept Responses stream events larger than 64 MiB

`createEventSourceResponseHandler` has a new `maxEventSize` option. The OpenAI and xAI Responses language models use it to accept events of up to 512 MiB, because `response.completed` repeats every output item, including base64 image generation results. Streams with several large generated images exceeded the default limit and failed after all images were delivered.
