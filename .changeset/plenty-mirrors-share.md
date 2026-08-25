---
"@ai-sdk/amazon-bedrock": patch
---

fix (provider/amazon-bedrock): emit well-formed Anthropic error events for eventstream exception frames

The Anthropic surface converted exception frames with `JSON.stringify({ type: 'error', error: event.data })`, where `event.data` is already a JSON string. The resulting `{"type":"error","error":"<string>"}` fails the Anthropic error schema (`error` must be an object with `type` and `message`), so a retryable provider exception such as a transient Bedrock 500 surfaced as an `AI_TypeValidationError` instead of the provider error. Exception frames now emit the proper error event shape, unwrapping the message and carrying the eventstream's exception type through as the error type.
