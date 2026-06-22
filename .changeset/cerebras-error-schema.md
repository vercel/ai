---
'@ai-sdk/cerebras': patch
---

fix(cerebras): match Cerebras's actual error envelope shape so API errors surface as `APICallError`

The Cerebras error schema previously expected `{ message, type, param, code }` at the top level, but Cerebras actually returns errors nested under `error` (with a top-level `status_code` on server errors). On any non-2xx response the response body failed schema validation, so callers saw a confusing `TypeValidationError` with a Zod parse failure instead of a clean `APICallError` carrying the upstream message.

`cerebrasErrorSchema` now mirrors the OpenAI-compatible envelope (`error.message` required, `error.type`/`error.param`/`error.code` nullish, `code` accepting `string | number`). 5xx responses from Cerebras GLM / Qwen / gpt-oss now surface with the actual upstream message.

**Note**: `CerebrasErrorData` (the inferred type) now reflects the nested shape. The previous flat shape never matched a real Cerebras response, so this only affects code that was already broken.
