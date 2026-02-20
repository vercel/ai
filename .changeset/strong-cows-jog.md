---
'@ai-sdk/google': patch
'ai': patch
---

The new Gemini 3 model, requires a `thought_signature` to be returned with image
parts.

> Image generation/editing (Strict): The API enforces strict validation on all Model parts including a thoughtSignature. Missing signatures will result in a 400 error.
> https://ai.google.dev/gemini-api/docs/gemini-3#thought_signatures

This patch makes sure the required Google Gemini thought_signature is
propagated from the `part.thoughtSignature` to `providerMetadata` and then to
`providerOptions` and then stored in `state.messages` to be properly
returned to the backend, for images.
