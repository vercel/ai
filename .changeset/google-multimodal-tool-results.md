---
'@ai-sdk/google': patch
---

Add multimodal tool-result support for Google function responses.

Tool results with `output.type = 'content'` now map media parts into
`functionResponse.parts` for Google models, including `image-data`,
`file-data`, and base64 `data:` URLs in URL-style content parts.
Remote HTTP(S) URLs in URL-style tool-result parts are not supported.
