---
'ai': patch
---

fix(ai): preserve text provider metadata when extracting reasoning with `generateText`

`extractReasoningMiddleware` rebuilt the remaining text part from scratch in
its `wrapGenerate` path, so the `providerMetadata` a provider attaches to a
text part (e.g. the OpenAI Responses `itemId`) was dropped. The same
middleware's stream path kept it, and the sibling `extractJsonMiddleware`
preserves it with `{ ...part, text }`, so `generateText` and `streamText`
disagreed: `result.response.messages` lost the text part's `providerOptions`
only for the non-streaming path. The text part is now spread from the source
part with the extracted text applied.
