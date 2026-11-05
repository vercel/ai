---
'@ai-sdk/openai': patch
---

fix(openai): handle refusal content parts in the Responses API

The Responses API returns a `refusal` content part instead of `output_text` when the model declines a request. The response schema rejected these parts, so non-streaming calls failed with an `APICallError` ("Invalid JSON response"), and streamed `response.refusal.delta` / `response.refusal.done` events were dropped, producing empty text. Refusal content parts and stream events are now parsed: the refusal explanation is surfaced as text and the finish reason is mapped to `content-filter`.
