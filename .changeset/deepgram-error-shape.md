---
"@ai-sdk/deepgram": patch
---

fix(deepgram): parse Deepgram's err_code/err_msg error shape

API errors surfaced only the HTTP reason phrase ("Bad Request",
"Unauthorized") because the error schema expected a legacy
`{ "error": { "message", "code" } }` body. The schema now also accepts
Deepgram's actual `{ "err_code", "err_msg", "request_id" }` shape, so
`APICallError.message` carries the real cause (e.g.
`Invalid 'model' value of 'aura-2-not-a-real-voice-en'.`).
