---
'@ai-sdk/xai': patch
---

feat(provider/xai): support non-image file parts (PDF, text, CSV) in the Responses API via `input_file` + `file_url`

The xAI Responses API accepts `{ type: 'input_file', file_url }` for non-image documents (see https://docs.x.ai/docs/guides/chat-with-files), but the AI SDK xAI Responses provider previously threw `UnsupportedFunctionalityError` for any file part whose `mediaType` did not start with `image/`.

When a file part is passed with `data: URL` and a non-image media type, the provider now emits `{ type: 'input_file', file_url }`. `application/pdf` and `text/*` are also added to `supportedUrls` so the SDK does not download them to bytes before reaching the converter.

Inline-byte (base64) inputs for non-image media types continue to throw, since xAI's Responses API requires either a public URL or a pre-uploaded `file_id` for non-image documents.
