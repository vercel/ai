---
'@ai-sdk/openai': patch
---

feat(openai): add `accessPrograms` Responses provider option for OpenAI Daybreak

- Add the `accessPrograms` provider option (`Record<string, string>`, such as `{ cyber: 'daybreak_blue' }`), sent unchanged as the Responses API `access_programs` request field when set. Program names are not validated by the SDK, so new OpenAI programs work without an update.
- Return the access programs OpenAI applied as `providerMetadata.openai.accessPrograms` for generation, streaming, and batch results.
