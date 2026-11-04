---
'@ai-sdk/gateway': patch
---

Add opt-in streaming decoding of large generated images to reduce peak memory.

Set `providerOptions.gateway.experimental_streamingImageDecoding` to `true` to decode canonical base64 images of at least 64 KiB while reading the response. Extracted images are returned as `Uint8Array`; smaller images stay base64 strings, and mixed results are normalized to bytes. The client option is not forwarded to the service.

Default behavior preserves the API's base64 representation. Opting in changes the model result representation and replaces large image data with placeholders in validation errors. Accessing `GeneratedFile.base64` can require re-encoding the extracted bytes.
