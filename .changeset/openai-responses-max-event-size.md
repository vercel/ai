---
'@ai-sdk/provider-utils': patch
'@ai-sdk/openai': patch
---

fix(openai): accept OpenAI Responses stream events larger than 64 MiB

`createEventSourceResponseHandler` has a new `maxEventSize` option. The OpenAI Responses language model uses it to accept events of up to 512 MiB, because `response.completed` repeats every output item, including base64 image generation results. Streams with several large generated images exceeded the default limit and failed after all images were delivered.
