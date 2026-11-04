---
'@ai-sdk/provider-utils': patch
---

feat(provider-utils): add an `experimental_binaryFields` option to `createJsonResponseHandler`

Providers whose JSON responses carry large base64 strings (images, files) can list their paths, e.g. `createJsonResponseHandler(schema, { experimental_binaryFields: ['images[*]'] })`. The body is then read as a stream and canonical base64 strings of 64 KiB and more are decoded to `Uint8Array` while they arrive, instead of holding about four copies of the body in memory (chunks, concatenated bytes, text, parsed string). `rawValue`, validation errors and `APICallError.responseBody` contain a short placeholder string instead of the data. Handlers without the option are unchanged. `readResponseWithSizeLimit` accepts an optional `onChunk` callback that receives each chunk instead of the chunks being collected.
