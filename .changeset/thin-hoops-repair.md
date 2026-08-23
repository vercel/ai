---
"@ai-sdk/amazon-bedrock": patch
---

fix (provider/amazon-bedrock): transform stream exception events into Anthropic error format

Bedrock `invoke-with-response-stream` delivers mid-stream errors as event-stream
exception frames whose payload is a JSON string (e.g.
`{"message":"Bedrock is unable to process your request."}`). The Anthropic
fetch shim forwarded that payload verbatim as the `error` member, producing
`{"type":"error","error":"{\"message\":\"...\"}"}` — which fails the Anthropic
stream chunk schema (`error` must be `{ type, message }`) and surfaces as
`AI_TypeValidationError`, masking the actual Bedrock error and defeating
error-type-based retry handling. Exception frames are now normalized the same
way the non-streaming error branch already does, using the `:exception-type`
header (e.g. `modelStreamErrorException`) as the error type.
