---
'@ai-sdk/gateway': patch
---

Add opt-in streaming decoding of large generated speech audio to reduce peak memory.

Set `providerOptions.gateway.experimental_streamingAudioDecoding` to `true` to decode canonical base64 audio of at least 64 KiB while `doGenerate` of a gateway speech model reads the response. The audio is returned as `Uint8Array`; shorter audio and strings that are not canonical base64 stay base64 strings. Streaming speech is not affected. As for image models, the client option is not forwarded to the service.

Default behavior preserves the API's base64 representation. Opting in changes the model result representation and replaces the audio with a placeholder in `response.body` and in validation errors. Accessing `GeneratedAudioFile.base64` can require re-encoding the extracted bytes.
