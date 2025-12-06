---
'@ai-sdk/openai': patch
'@ai-sdk/azure': patch
---

Fix Responses `code_interpreter` annotations and add typed providerMetadata

- Align Responses API `code_interpreter` annotation types with the official spec.
- Add tests to ensure the overlapping parts of the Zod schemas used by `doGenerate` and `doStream` stay in sync.
- Export the following types for use in client code:
  - `OpenaiResponsesTextProviderMetadata`
  - `OpenaiResponsesSourceDocumentProviderMetadata`
  - `AzureResponsesTextProviderMetadata`
  - `AzureResponsesSourceDocumentProviderMetadata`
